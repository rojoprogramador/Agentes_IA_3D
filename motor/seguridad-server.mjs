// Servidor MCP "agentes-seguridad" (fase B6): escaneos PASIVOS en contenedores Docker, solo dentro del alcance
// firmado por el cliente. El motor lo declara con --mcp-config en las tareas del rol auditor_seguridad y le pasa
// el alcance del cliente de ESA tarea (AGENTES_ALCANCE); el agente no puede cambiarlo.
// run_scan además pide aprobación humana (B4): está en accionesConAprobacion.
//
//   ver_alcance  → qué está autorizado, hasta cuándo y en qué ventana
//   run_scan     → tipo + objetivo; valida, toma el candado (uno a la vez en el PC), corre el contenedor y resume
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, openSync, closeSync, rmSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { TIPOS, IMAGENES, alcanceVigente, objetivoEnAlcance, argsDocker, argsActualizarNuclei, fallaHerramienta, LECTORES, OWASP_2025, candadoLibre } from './seguridad.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const CWD = process.cwd() // carpeta de la tarea
const LOGS = process.env.AGENTES_SEGURIDAD_LOGS || join(ROOT, 'logs') // las pruebas usan otra carpeta
const CANDADO = join(LOGS, 'seguridad.lock')
const REGISTRO = join(LOGS, 'seguridad-registro.jsonl') // quién escaneó qué y cuándo (rendición de cuentas)
const ZONA = process.env.AGENTES_ZONA || 'America/Bogota'
const MAX_REPO_MB = 500
const ok = (o) => ({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o, null, 1) }] })
const fail = (e) => ({ content: [{ type: 'text', text: `No se hizo el escaneo: ${e?.message || e}` }], isError: true })
const espera = (ms) => new Promise(r => setTimeout(r, ms))

function alcance() {
  try { return JSON.parse(process.env.AGENTES_ALCANCE || 'null') } catch { return null }
}

function correr(cmd, args, { timeoutMs, cwd, env } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env: env || process.env, windowsHide: true })
    let out = '', err = ''
    const t = setTimeout(() => { err += '\nTiempo máximo agotado'; p.kill('SIGKILL') }, timeoutMs)
    p.stdout.on('data', d => { out = (out + d).slice(-20000) })
    p.stderr.on('data', d => { err = (err + d).slice(-20000) })
    p.on('error', e => { clearTimeout(t); resolve({ code: -1, out, err: e.code === 'ENOENT' ? `${cmd} no está instalado` : e.message }) })
    p.on('close', code => { clearTimeout(t); resolve({ code, out, err }) })
  })
}

const pidVivo = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
async function tomarCandado(maxMs = 10 * 60_000) {
  mkdirSync(LOGS, { recursive: true })
  const fin = Date.now() + maxMs
  for (;;) {
    try { closeSync(openSync(CANDADO, 'wx')); writeFileSync(CANDADO, `${process.pid} ${new Date().toISOString()}`); return true } catch {}
    let contenido = ''
    try { contenido = readFileSync(CANDADO, 'utf8') } catch {}
    if (candadoLibre(contenido, pidVivo)) { rmSync(CANDADO, { force: true }); continue }
    if (Date.now() > fin) return false
    await espera(5000)
  }
}
const soltarCandado = () => { try { if (readFileSync(CANDADO, 'utf8').startsWith(`${process.pid} `)) rmSync(CANDADO, { force: true }) } catch {} }

function tamanoMb(dir) {
  let n = 0
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.isFile()) n += statSync(p).size } }
  try { walk(dir) } catch {}
  return n / 1048576
}

// Copia del repo en la carpeta de la tarea (se reutiliza entre escaneos de la misma tarea)
async function clonar(repo) {
  const dir = join(CWD, 'seguridad', 'repo-' + createHash('sha1').update(repo).digest('hex').slice(0, 10))
  if (existsSync(join(dir, '.git'))) return dir
  mkdirSync(dirname(dir), { recursive: true })
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' }
  const r = await correr('git', ['clone', '--no-tags', '--single-branch', '--no-recurse-submodules', `${repo}.git`, dir], { timeoutMs: 5 * 60_000, env })
  if (r.code !== 0) { rmSync(dir, { recursive: true, force: true }); throw new Error(`No pude clonar ${repo}: ${r.err.trim().split('\n').pop()}`) }
  const mb = tamanoMb(dir)
  if (mb > MAX_REPO_MB) { rmSync(dir, { recursive: true, force: true }); throw new Error(`El repositorio pesa ${Math.round(mb)} MB (máximo ${MAX_REPO_MB})`) }
  return dir
}

function registrar(datos) {
  try { mkdirSync(LOGS, { recursive: true }); appendFileSync(REGISTRO, JSON.stringify({ ts: new Date().toISOString(), cliente: process.env.AGENTES_CLIENTE || '', tarea: process.env.AGENTES_TAREA || '', agente: process.env.AGENTES_AGENTE || '', ...datos }) + '\n') } catch {}
}

const server = new McpServer({ name: 'agentes-seguridad', version: '1.0.0' })

server.tool('ver_alcance',
  'Muestra qué autorizó el cliente para pruebas de seguridad: dominios, IPs, repositorios, vigencia, ventana horaria y si hoy se puede escanear cada tipo. Úsala SIEMPRE antes de run_scan.',
  {},
  async () => {
    const a = alcance()
    if (!a) return ok('Este cliente no tiene alcance de seguridad cargado. No se puede escanear nada: pide al dueño que llene "Alcance" en la ficha del cliente con la autorización firmada.')
    const ahora = Date.now()
    return ok({
      dominios: a.dominios || [], incluyeSubdominios: a.subdominios === true, ips: a.ips || [], repos: a.repos || [],
      vigencia: { desde: a.vigenciaDesde || a.fecha || '', hasta: a.vigenciaHasta || '' }, ventana: a.ventana || null, zona: ZONA,
      firmante: a.autorizadoPor || '', notas: a.notas || '',
      tipos: Object.fromEntries(Object.entries(TIPOS).map(([k, d]) => [k, { que: d.nombre, objetivo: d.objetivo === 'repo' ? 'URL del repositorio' : d.objetivo === 'host' ? 'dominio' : 'URL', tocaProduccion: d.vivo, activo: !!d.activo, hoy: alcanceVigente(a, k, ahora, ZONA) }])),
      pruebasActivas: a.pruebasActivas === true ? `Autorizadas, máximo ${a.limiteRps} peticiones por segundo. Contacto de emergencia: ${a.contactoEmergencia}` : 'NO autorizadas: solo pasivas',
      nunca: 'Denegación de servicio, fuerza bruta de contraseñas, explotación, ingeniería social y pruebas contra personas: prohibidas siempre.',
    })
  })

server.tool('run_scan',
  'Corre UN escaneo pasivo dentro del alcance autorizado, en un contenedor aislado. Tipos: secretos, dependencias, codigo, vulnerabilidades (sobre un repositorio autorizado; no tocan producción) y tls, web_pasivo (sobre un dominio autorizado y solo dentro de la ventana). Devuelve hallazgos con severidad y categoría OWASP Top 10:2025.',
  { tipo: z.enum(Object.keys(TIPOS)), objetivo: z.string().min(3).max(300) },
  async ({ tipo, objetivo }) => {
    const a = alcance()
    if (!a) { registrar({ tipo, objetivo, resultado: 'rechazado', motivo: 'sin alcance' }); return fail('El cliente no tiene alcance de seguridad cargado en su ficha') }
    const obj = objetivoEnAlcance(tipo, objetivo, a)
    if (!obj.ok) { registrar({ tipo, objetivo, resultado: 'rechazado', motivo: obj.motivo }); return fail(obj.motivo) }
    const vig = alcanceVigente(a, tipo, Date.now(), ZONA)
    if (!vig.ok) { registrar({ tipo, objetivo, resultado: 'rechazado', motivo: vig.motivo }); return fail(vig.motivo) }
    const def = TIPOS[tipo]
    const docker = await correr('docker', ['version', '--format', '{{.Server.Version}}'], { timeoutMs: 20_000 })
    if (docker.code !== 0) return fail(/no está instalado/.test(docker.err) ? 'Docker no está instalado en el PC del motor' : `Docker no responde (${docker.err.trim().split('\n').pop()})`)
    if (!(await tomarCandado())) return fail('Hay otro escaneo de seguridad en curso desde hace más de 10 minutos; intenta más tarde')
    const inicio = Date.now()
    try {
      const src = def.objetivo === 'repo' ? await clonar(obj.objetivo) : ''
      const out = join(CWD, 'seguridad', `${tipo}-${new Date(inicio).toISOString().replace(/[:.]/g, '-')}`)
      mkdirSync(out, { recursive: true })
      const uid = process.getuid?.() ?? 1000, gid = process.getgid?.() ?? 1000
      const cache = join(LOGS, def.herramienta === 'nuclei' ? 'cache-nuclei' : 'cache-trivy')
      if (['trivy', 'nuclei'].includes(def.herramienta)) mkdirSync(cache, { recursive: true })
      const args = argsDocker(tipo, obj.objetivo, { src, out, uid: uid || 1000, gid: gid || 1000, cache, rps: Number(a.limiteRps) || 5 })
      if (def.herramienta === 'nuclei' && !existsSync(join(cache, 'nuclei-templates'))) {
        const u = await correr('docker', argsActualizarNuclei({ cache, uid: uid || 1000, gid: gid || 1000 }), { timeoutMs: 10 * 60_000 })
        if (!existsSync(join(cache, 'nuclei-templates'))) throw new Error(`No pude descargar las plantillas de nuclei: ${u.err.trim().split('\n').pop()}`)
      }
      registrar({ tipo, objetivo: obj.objetivo, resultado: 'iniciado', imagen: IMAGENES[def.herramienta] })
      const r = await correr('docker', args, { timeoutMs: (def.vivo ? 20 : 30) * 60_000 })
      const falla = fallaHerramienta(def.herramienta, r.code, r.err)
      if (falla) { registrar({ tipo, objetivo: obj.objetivo, resultado: 'error', motivo: falla }); return fail(falla) }
      const [archivo, leer] = LECTORES[def.herramienta]
      const ruta = join(out, archivo)
      if (!existsSync(ruta)) {
        registrar({ tipo, objetivo: obj.objetivo, resultado: 'error', codigo: r.code })
        return fail(`La herramienta no dejó resultados (código ${r.code}). ${r.err.trim().split('\n').slice(-3).join(' ').slice(0, 400)}`)
      }
      const texto = readFileSync(ruta, 'utf8')
      // nmap (XML) y nuclei (una línea JSON por hallazgo) se leen como texto; el resto es un JSON
      const res = ['nmap', 'nuclei'].includes(def.herramienta) ? leer(texto) : leer(texto.trim() ? JSON.parse(texto) : [])
      writeFileSync(join(out, 'resumen.json'), JSON.stringify(res, null, 1))
      registrar({ tipo, objetivo: obj.objetivo, resultado: 'ok', segundos: Math.round((Date.now() - inicio) / 1000), totales: res.totales })
      return ok({
        tipo, que: def.nombre, objetivo: obj.objetivo, herramienta: IMAGENES[def.herramienta], segundos: Math.round((Date.now() - inicio) / 1000),
        ...res, owasp: Object.fromEntries([...new Set(res.hallazgos.map(h => h.owasp))].sort().map(k => [k, OWASP_2025[k]])), carpeta: out.slice(CWD.length + 1),
        nota: res.total > res.hallazgos.length ? `Se muestran ${res.hallazgos.length} de ${res.total}; el detalle está en la carpeta.` : undefined,
      })
    } catch (e) {
      registrar({ tipo, objetivo: obj.objetivo, resultado: 'error', motivo: String(e.message).slice(0, 200) })
      return fail(e)
    } finally { soltarCandado() }
  })

await server.connect(new StdioServerTransport())
