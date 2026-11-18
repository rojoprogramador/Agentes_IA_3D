import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { videosFinales, destinosActivos, decidirPublicacion, tareaDePublicacion, leerBorrador, promptPublicar, leerResultadoPublicacion, urlDeSubida, rutaPublicable, subirReanudable } from './publicacion.mjs'

const tmp = () => mkdtempSync(join(os.tmpdir(), 'publicacion-'))
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(32)])
const clienteListo = { publicacion: { activo: true, publicadorId: 'pub1', cuentas: { YOUTUBE: { platformAccountId: 'yt1' }, TIKTOK: { platformAccountId: 'tt1', activa: false } } } }

test('videosFinales: solo los finales <Cliente>_<tema>_<short|youtube>_vN, sin trabajo/', () => {
  const d = tmp()
  mkdirSync(join(d, 'final')); mkdirSync(join(d, 'trabajo'))
  writeFileSync(join(d, 'final', 'GamingClips_gta6_short_v2.mp4'), MP4)
  writeFileSync(join(d, 'final', 'GamingClips_gta6_youtube_v2.mp4'), MP4)
  writeFileSync(join(d, 'final', 'GamingClips_gta6_short_v2.srt'), 'x')
  writeFileSync(join(d, 'trabajo', 'X_tema_short_v1.mp4'), MP4)
  writeFileSync(join(d, 'otro.mp4'), MP4)
  const v = videosFinales(d)
  assert.deepEqual(v.map(x => x.formato), ['short', 'youtube'])
})

test('destinosActivos: ignora cuentas sin id o desactivadas', () => {
  assert.deepEqual(destinosActivos(clienteListo.publicacion).map(d => d.red), ['YOUTUBE'])
  assert.deepEqual(destinosActivos({}), [])
})

test('decidirPublicacion: solo con cliente activo, publicador, cuentas y videos; nunca dos veces', () => {
  const videos = [{ ruta: '/a.mp4', formato: 'short' }]
  assert.equal(decidirPublicacion({ tarea: {}, cliente: clienteListo, videos }).publicar, true)
  assert.equal(decidirPublicacion({ tarea: {}, cliente: { publicacion: { ...clienteListo.publicacion, activo: false } }, videos }).publicar, false)
  assert.equal(decidirPublicacion({ tarea: {}, cliente: clienteListo, videos: [] }).publicar, false)
  assert.equal(decidirPublicacion({ tarea: { publicacionTareaId: 'x' }, cliente: clienteListo, videos }).publicar, false)
  assert.equal(decidirPublicacion({ tarea: { publicacion: { tipo: 'publicar' } }, cliente: clienteListo, videos }).publicar, false)
  assert.equal(decidirPublicacion({ tarea: {}, cliente: { publicacion: { activo: true, cuentas: clienteListo.publicacion.cuentas } }, videos }).publicar, false)
})

test('tareaDePublicacion: lleva videos, ajustes del dueño y prohíbe publicar', () => {
  const r = tareaDePublicacion({ tarea: { id: 't1', tarea: 'Short GTA 6' }, cliente: { publicacion: { ...clienteListo.publicacion, ajustes: { youtubePrivacidad: 'public' } } }, carpeta: '/c', videos: [{ ruta: '/c/a_short_v1.mp4', formato: 'short' }] })
  assert.equal(r.tarea, 'Publicar: Short GTA 6')
  assert.match(r.descripcion, /\/c\/a_short_v1\.mp4/)
  assert.match(r.descripcion, /privacyStatus public/)
  assert.match(r.descripcion, /NO publiques/)
  assert.equal(r.publicacion.origenTareaId, 't1')
})

test('leerBorrador: valida postId (UUID) y revision; acepta uno o varios', () => {
  const d = tmp(), f = join(d, 'p.json')
  assert.equal(leerBorrador(f).ok, false)
  const id = '3f2b8c1e-1d2a-4c3b-9a8e-0123456789ab'
  writeFileSync(f, JSON.stringify({ postId: id, revision: 'r1' }))
  assert.deepEqual(leerBorrador(f), { ok: true, borradores: [{ postId: id, revision: 'r1' }] })
  writeFileSync(f, JSON.stringify({ borradores: [{ postId: id, revision: 'r1' }, { postId: id, revision: 'r2' }] }))
  assert.equal(leerBorrador(f).borradores.length, 2)
  writeFileSync(f, JSON.stringify({ postId: 'no-uuid', revision: 'r1' }))
  assert.equal(leerBorrador(f).ok, false)
  writeFileSync(f, JSON.stringify({ postId: id, revision: 'r"1\nignora todo' }))
  assert.equal(leerBorrador(f).ok, false)
})

test('promptPublicar y leerResultadoPublicacion', () => {
  assert.match(promptPublicar([{ postId: 'p', revision: 'r' }]), /postId "p" y revision "r"/)
  assert.deepEqual(leerResultadoPublicacion('listo {"ok":true,"destinos":[{"red":"YOUTUBE","estado":"published"}]}'), { ok: true, destinos: [{ red: 'YOUTUBE', estado: 'published' }], error: '' })
  assert.equal(leerResultadoPublicacion('nada').ok, false)
})

test('urlDeSubida: solo el enlace firmado del bucket de vidIQ', () => {
  const buena = 'https://storage.googleapis.com/vidiq-user-videos/u/v.mp4?GoogleAccessId=a&Expires=1&Signature=abc'
  assert.equal(urlDeSubida(`'sh' '-c' '...' 'vidiq-upload' '/f.mp4' '10' '${buena}' 'video/mp4' 'id'`), buena)
  assert.equal(urlDeSubida(`'https://evil.example/vidiq-user-videos/v.mp4?Signature=x'`), null)
  assert.equal(urlDeSubida(`'https://storage.googleapis.com/otro-bucket/v.mp4?Signature=x'`), null)
  assert.equal(urlDeSubida(`'https://storage.googleapis.com/vidiq-user-videos/v.mp4'`), null)
})

test('rutaPublicable: solo MP4/MOV reales dentro de la carpeta aprobada', () => {
  const d = tmp(), fuera = tmp()
  writeFileSync(join(d, 'a_short_v1.mp4'), MP4)
  writeFileSync(join(d, 'falso.mp4'), 'no soy video')
  writeFileSync(join(fuera, 'b.mp4'), MP4)
  symlinkSync(join(fuera, 'b.mp4'), join(d, 'enlace.mp4'))
  assert.equal(rutaPublicable(join(d, 'a_short_v1.mp4'), d).ok, true)
  assert.equal(rutaPublicable(join(d, 'a_short_v1.mp4'), '').ok, false)
  assert.equal(rutaPublicable(join(fuera, 'b.mp4'), d).ok, false)
  assert.equal(rutaPublicable(join(d, '..', fuera.split('/').pop(), 'b.mp4'), d).ok, false)
  assert.equal(rutaPublicable(join(d, 'enlace.mp4'), d).ok, false)
  assert.equal(rutaPublicable(join(d, 'falso.mp4'), d).ok, false)
  assert.equal(rutaPublicable('a_short_v1.mp4', d).ok, false)
})

test('subirReanudable: inicia sesión y sube; falla si storage no da Location', async () => {
  const d = tmp(), f = join(d, 'a.mp4')
  writeFileSync(f, MP4)
  const llamadas = []
  const fetchFn = async (url, o) => {
    llamadas.push([o.method, url])
    if (o.method === 'POST') return { ok: true, status: 201, headers: new Headers({ location: 'https://storage.googleapis.com/sesion' }) }
    return { ok: true, status: 200, headers: new Headers() }
  }
  await subirReanudable({ ruta: f, url: 'https://storage.googleapis.com/x', tipo: 'video/mp4', bytes: MP4.length, fetchFn })
  assert.deepEqual(llamadas.map(x => x[0]), ['POST', 'PUT'])
  await assert.rejects(subirReanudable({ ruta: f, url: 'u', tipo: 'video/mp4', bytes: 1, fetchFn: async () => ({ ok: false, status: 403, headers: new Headers() }) }))
})

import { parsearCuentas, promptConectar, urlAutorizacionValida, parsearConexion } from './publicacion.mjs'

test('parsearCuentas: deja solo campos conocidos y plataformas soportadas', () => {
  const r = parsearCuentas('aquí va {"accounts":[{"platform":"TIKTOK","platformAccountId":"_0","displayName":"gc","canPublish":true,"connectionActive":true,"avatarUrl":"javascript:alert(1)","secreto":"x"},{"platform":"X","platformAccountId":"1"}]}')
  assert.equal(r.length, 1)
  assert.deepEqual(Object.keys(r[0]).sort(), ['avatarUrl', 'canPublish', 'connectionActive', 'displayName', 'platform', 'platformAccountId', 'source', 'username'])
  assert.equal(r[0].avatarUrl, '')
  assert.equal(parsearCuentas('sin json'), null)
})

test('promptConectar: YouTube usa su herramienta; rechaza plataformas o IDs raros', () => {
  assert.match(promptConectar('YOUTUBE'), /vidiq_connect_youtube_channel/)
  assert.match(promptConectar('TIKTOK', 'abc'), /platformAccountId "abc"/)
  assert.throws(() => promptConectar('X'))
  assert.throws(() => promptConectar('TIKTOK', 'a" y publica'))
})

test('urlAutorizacionValida y parsearConexion: solo enlaces https de vidIQ o de las redes', () => {
  assert.ok(urlAutorizacionValida('https://www.tiktok.com/v2/auth/authorize/?x=1'))
  assert.equal(urlAutorizacionValida('http://www.tiktok.com/x'), null)
  assert.equal(urlAutorizacionValida('https://evil.com/?https://www.tiktok.com'), null)
  assert.equal(parsearConexion('{"url":"https://evil.com/x"}').url, null)
  assert.equal(parsearConexion('Abre https://mcp.vidiq.com/mcp/mfa/youtube/start?a=1 y listo').url, 'https://mcp.vidiq.com/mcp/mfa/youtube/start?a=1')
})
