// Video: entradas desde Google Drive, validación de archivos y nombres de entrega.
// Lo usan el motor (descarga la entrada antes de la tarea, entrega final de respaldo, limpieza al aprobar) y el
// servidor de medios (intermedios en trabajo/, entregar_video). Funciones puras salvo las que llaman a ffprobe.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { openSync, readSync, closeSync, statSync } from 'node:fs'

export const EXT_VIDEO = ['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi']

// ---------- Links de Google Drive ----------
// /file/d/<id>, open?id=<id>, uc?id=<id> → archivo · /drive/folders/<id> → carpeta. Docs/Sheets no son video.
export function idDeDrive(url) {
  let u
  try { u = new URL(String(url).trim()) } catch { return null }
  if (!/(^|\.)drive\.google\.com$/i.test(u.hostname) && !/(^|\.)drive\.usercontent\.google\.com$/i.test(u.hostname)) return null
  const id = (s) => (/^[\w-]{10,}$/.test(s || '') ? s : null)
  let m = u.pathname.match(/\/file\/d\/([\w-]+)/)
  if (m && id(m[1])) return { tipo: 'archivo', id: m[1] }
  m = u.pathname.match(/\/folders\/([\w-]+)/)
  if (m && id(m[1])) return { tipo: 'carpeta', id: m[1] }
  const q = id(u.searchParams.get('id'))
  if (q) return { tipo: 'archivo', id: q }
  return null
}

// Todos los links de Drive de una tarea: link de recursos, descripción, campos del brief y archivos del brief
export function linksDeDrive(t = {}) {
  const textos = [t.links, t.descripcion, t.linkTerminada, ...Object.values(t.briefCampos || {}), ...(Array.isArray(t.brief?.archivos) ? t.brief.archivos : []), t.brief?.contexto]
  const vistos = new Map()
  for (const s of textos) {
    for (const url of String(s || '').match(/https?:\/\/[^\s)<>"'\]]+/g) || []) {
      const d = idDeDrive(url)
      if (d && !vistos.has(d.id)) vistos.set(d.id, { ...d, url })
    }
  }
  return [...vistos.values()]
}

// ---------- Nombres ----------
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
// "Plomeros SAOR" → "PlomerosSAOR"
export function nombreCliente(s) {
  const limpio = sinTildes(s).replace(/[^A-Za-z0-9 ]+/g, ' ').trim()
  return (limpio.split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join('') || 'Interno').slice(0, 30)
}
// "Cómo destapar un lavaplatos en Cali (video corto)" → "destapar-lavaplatos-cali"
const VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'un', 'una', 'unos', 'unas', 'y', 'o', 'en', 'para', 'por', 'con', 'sin', 'a', 'al', 'como', 'que', 'su', 'sus', 'tu', 'video', 'videos', 'corto', 'largo', 'mp4', 'v', 'version'])
export function temaCorto(s, maxPalabras = 4) {
  const palabras = sinTildes(s).toLowerCase().replace(/\bv\d+\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter(w => w && !VACIAS.has(w) && !/^\d{4}$/.test(w))
  return palabras.slice(0, maxPalabras).join('-').slice(0, 40) || 'video'
}
// <Cliente>_<tema-corto>_<formato>_v<N>.<ext> · formato: short | youtube
export function nombreFinal({ cliente, tema, formato, n, ext = '.mp4' }) {
  const f = formato === 'short' ? 'short' : 'youtube'
  const e = ext.startsWith('.') ? ext : '.' + ext
  return `${nombreCliente(cliente)}_${temaCorto(tema)}_${f}_v${Math.max(1, Number(n) || 1)}${e.toLowerCase()}`
}
// Vertical o cuadrado = short; horizontal = youtube
export const formatoPorTamano = (ancho, alto) => (ancho && alto && alto >= ancho ? 'short' : 'youtube')

// Nombre fijo de un paso intermedio: mismo paso + misma entrada + mismos parámetros = mismo archivo (se reutiliza)
export function nombreIntermedio(paso, entrada, params = {}, ext = '.mp4') {
  let firma = ''
  try { const st = statSync(entrada); firma = `${st.size}:${Math.round(st.mtimeMs)}` } catch { /* entrada nueva */ }
  const hash = createHash('sha1').update(JSON.stringify([paso, String(entrada), firma, params])).digest('hex').slice(0, 8)
  const base = String(entrada).split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/\.[a-z_]+\.[0-9a-f]{8}$/, '')
  return `${base.slice(0, 40)}.${paso}.${hash}${ext}`
}

// ---------- Validación ----------
// Los primeros bytes de una página de login de Google (o cualquier HTML/JSON) no son un video
export function pareceTexto(buf) {
  const s = Buffer.from(buf || []).subarray(0, 512).toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase()
  return s.startsWith('<!doctype') || s.startsWith('<html') || s.startsWith('<?xml') || s.startsWith('{') || s.includes('<head')
}
export function primerosBytes(file, n = 512) {
  const fd = openSync(file, 'r')
  try { const b = Buffer.alloc(n); const leidos = readSync(fd, b, 0, n, 0); return b.subarray(0, leidos) } finally { closeSync(fd) }
}

// ffprobe: ¿tiene una pista de video con duración? Devuelve { ok, motivo, duracion, ancho, alto }
export function validarVideo(file, ffprobePath) {
  return new Promise((done) => {
    let tam = 0
    try { tam = statSync(file).size } catch { return done({ ok: false, motivo: 'el archivo no existe' }) }
    if (tam < 1024) return done({ ok: false, motivo: `pesa solo ${tam} bytes` })
    try { if (pareceTexto(primerosBytes(file))) return done({ ok: false, motivo: 'es una página web (probablemente el login de Google), no un video' }) } catch { /* sigue con ffprobe */ }
    const p = spawn(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { windowsHide: true })
    let out = ''
    p.stdout.on('data', d => { out += d })
    p.on('error', e => done({ ok: false, motivo: 'no pude ejecutar ffprobe: ' + e.message }))
    p.on('close', () => {
      let j = null
      try { j = JSON.parse(out) } catch { return done({ ok: false, motivo: 'ffprobe no lo reconoce como video' }) }
      const v = (j.streams || []).find(s => s.codec_type === 'video' && s.disposition?.attached_pic !== 1)
      const duracion = parseFloat(j.format?.duration || v?.duration || '0') || 0
      if (!v) return done({ ok: false, motivo: 'no tiene pista de video' })
      if (duracion <= 0) return done({ ok: false, motivo: 'no tiene duración' })
      done({ ok: true, duracion, ancho: v.width || 0, alto: v.height || 0 })
    })
  })
}
