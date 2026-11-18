// Curador de skills (fase B3). Las skills se acumulan: las instaladas desde el buscador, las aprendidas (B2) y las
// de cada cliente. Cada una ocupa contexto del agente (Claude lee su descripción para decidir si la usa), así que
// las que nadie usa son ruido. Como el curador de Hermes Agent:
//   1) cuenta cuántas veces se usa cada skill (llamadas a la herramienta Skill o lecturas de su SKILL.md),
//   2) una vez por semana, con el motor libre, marca "inactiva" la que lleva 14 días sin uso (solo un aviso),
//   3) a los 30 días la ARCHIVA: la mueve a motor/skills-archivo/. Nunca borra nada y se puede restaurar.
// Respeta las skills fijadas en el panel, las asignadas a agentes y las de agentes con rutinas programadas.
// Antes de cada pasada real guarda una copia .tar.gz. Con "simular" solo informa, sin mover nada.
//
// Uso a mano (solo simulación, no necesita Firestore): node curador.mjs --simular
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join, dirname, basename, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const AJUSTES_CURADOR = { activo: true, simular: true, diasInactiva: 14, diasArchivo: 30, cadaDias: 7, horasLibre: 2, fijadas: [] }
const DIA = 24 * 60 * 60 * 1000
const NOMBRE = /^[a-z0-9][a-z0-9._-]{0,63}$/i
const CLIENTE = /^[A-Za-z0-9_-]{1,64}$/
const MAX_RESPALDOS = 8

// ---------- 1) Contar usos en la salida de Claude Code (--output-format stream-json) ----------
// Cada línea es un evento JSON. Los del asistente traen los tool_use: Skill {skill: "pdf"} o
// Read {file_path: ".../.claude/skills/pdf/SKILL.md"} (algunos modelos leen el archivo en vez de usar Skill).
export function skillsUsadas(raw) {
  const conteo = new Map()
  const sumar = (n) => { const s = String(n || '').split(':').pop().trim(); if (NOMBRE.test(s)) conteo.set(s, (conteo.get(s) || 0) + 1) }
  for (const linea of String(raw || '').split(/\r?\n/)) {
    if (!linea.includes('tool_use')) continue
    let ev
    try { ev = JSON.parse(linea) } catch { continue }
    const contenido = ev?.type === 'assistant' && Array.isArray(ev.message?.content) ? ev.message.content : []
    for (const c of contenido) {
      if (c?.type !== 'tool_use') continue
      if (c.name === 'Skill') sumar(c.input?.skill ?? c.input?.command ?? c.input?.name)
      else if (c.name === 'Read') {
        const m = String(c.input?.file_path || '').match(/[\\/]\.claude[\\/]skills[\\/]([^\\/]+)[\\/]SKILL\.md$/i)
        if (m) sumar(m[1])
      }
    }
  }
  return conteo
}

// ---------- 2) Estado persistente (logs/skills-uso.json) ----------
// { skills: { clave: { usos, ultimoUso, vistaDesde, estado } }, ultimaPasada, ultimoInforme }
// clave = nombre (global) o "<clienteId>/<nombre>" (skill de un cliente)
export function leerEstado(ruta) {
  try { const j = JSON.parse(readFileSync(ruta, 'utf8')); return { skills: {}, ...j, skills: j.skills || {} } } catch { return { skills: {} } }
}
export function guardarEstado(ruta, estado) {
  mkdirSync(dirname(ruta), { recursive: true })
  const tmp = ruta + '.tmp'
  writeFileSync(tmp, JSON.stringify(estado, null, 2) + '\n')
  renameSync(tmp, ruta) // escritura atómica: si el PC se apaga a la mitad, queda el archivo anterior
}
export function sumarUsos(estado, claves, ahoraIso) {
  for (const [clave, veces] of claves) {
    const e = estado.skills[clave] || (estado.skills[clave] = { usos: 0, vistaDesde: ahoraIso })
    e.usos = (e.usos || 0) + veces
    e.ultimoUso = ahoraIso
  }
  return estado
}

// ---------- 3) Inventario: skills del motor que el curador administra ----------
// Las de ~/.claude/skills (las del usuario del PC) no se tocan nunca.
export function inventario(ROOT) {
  const out = []
  const conSkill = (dir) => { try { return readdirSync(dir).filter(n => NOMBRE.test(n) && existsSync(join(dir, n, 'SKILL.md'))) } catch { return [] } }
  for (const n of conSkill(join(ROOT, '.claude', 'skills'))) out.push({ clave: n, nombre: n, alcance: 'global', dir: join(ROOT, '.claude', 'skills', n) })
  let clientes = []
  try { clientes = readdirSync(join(ROOT, 'skills-clientes')).filter(c => CLIENTE.test(c)) } catch {}
  for (const c of clientes) {
    for (const n of conSkill(join(ROOT, 'skills-clientes', c))) out.push({ clave: `${c}/${n}`, nombre: n, alcance: 'cliente', clienteId: c, dir: join(ROOT, 'skills-clientes', c, n) })
  }
  return out
}

// ---------- 4) Decidir (función pura) ----------
// El reloj de una skill empieza en su último uso; si nunca se usó, cuando el curador la vio por primera vez
// (o cuando se instaló, si es más reciente). Así, al estrenar el contador nada se archiva antes de 30 días.
export function planCuracion({ skills, estado, protegidas = new Set(), ahora = Date.now(), diasInactiva = 14, diasArchivo = 30, instaladas = {} }) {
  const acciones = []
  const nuevoEstado = { ...estado, skills: { ...estado.skills } }
  const iso = new Date(ahora).toISOString()
  for (const s of skills) {
    const e = { ...(nuevoEstado.skills[s.clave] || { usos: 0, vistaDesde: iso }) }
    if (!e.vistaDesde) e.vistaDesde = iso
    nuevoEstado.skills[s.clave] = e
    const desde = Math.max(...[e.ultimoUso, e.vistaDesde, instaladas[s.clave]].map(x => Date.parse(x || '') || 0))
    const dias = Math.floor((ahora - desde) / DIA)
    const base = { clave: s.clave, nombre: s.nombre, alcance: s.alcance, clienteId: s.clienteId, dias, usos: e.usos || 0 }
    if (protegidas.has(s.clave) || protegidas.has(s.nombre)) {
      if (e.estado === 'inactiva') acciones.push({ ...base, accion: 'reactivar', motivo: 'protegida' })
      continue
    }
    if (dias >= diasArchivo) acciones.push({ ...base, accion: 'archivar', motivo: `${dias} días sin uso` })
    else if (dias >= diasInactiva) { if (e.estado !== 'inactiva') acciones.push({ ...base, accion: 'inactivar', motivo: `${dias} días sin uso` }) }
    else if (e.estado === 'inactiva') acciones.push({ ...base, accion: 'reactivar', motivo: 'se volvió a usar' })
  }
  return { acciones, estado: nuevoEstado }
}

// ¿Toca pasada? Semanal y solo con el motor libre desde hace un rato (no compite con tareas de clientes)
export function tocaPasada({ ultimaPasada, ultimaActividad, ocupado, ahora = Date.now(), cadaDias = 7, horasLibre = 2 }) {
  if (ocupado) return false
  if (ahora - (ultimaActividad || 0) < horasLibre * 60 * 60 * 1000) return false
  return ahora - (Date.parse(ultimaPasada || '') || 0) >= cadaDias * DIA
}

// ---------- 5) Aplicar: respaldo, archivar, restaurar ----------
export function respaldar(ROOT, carpeta, ahora = Date.now()) {
  const incluir = ['.claude/skills', 'skills-clientes'].filter(p => existsSync(join(ROOT, p)))
  if (!incluir.length) return ''
  mkdirSync(carpeta, { recursive: true })
  const archivo = join(carpeta, `skills-${new Date(ahora).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.tar.gz`)
  const r = spawnSync('tar', ['-czf', archivo, '-C', ROOT, ...incluir], { windowsHide: true, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`No pude crear el respaldo: ${(r.stderr || r.error?.message || '').trim().split('\n').pop()}`)
  // Solo los últimos respaldos (los viejos ocupan espacio y la skill sigue en el archivo)
  const viejos = readdirSync(carpeta).filter(f => /^skills-.*\.tar\.gz$/.test(f)).sort().slice(0, -MAX_RESPALDOS)
  for (const f of viejos) rmSync(join(carpeta, f), { force: true })
  return archivo
}

const raizArchivo = (ROOT) => join(ROOT, 'skills-archivo')

export function archivar(ROOT, s, ahora = Date.now()) {
  const grupo = s.alcance === 'cliente' ? s.clienteId : '_global'
  if (!CLIENTE.test(grupo) || !NOMBRE.test(s.nombre)) throw new Error('Skill inválida')
  const base = join(raizArchivo(ROOT), grupo)
  mkdirSync(base, { recursive: true })
  let destino = join(base, s.nombre)
  if (existsSync(destino)) destino = `${destino}-${new Date(ahora).toISOString().slice(0, 10)}-${ahora % 100000}`
  renameSync(s.dir, destino) // mover, no copiar: la skill deja de cargarse pero sigue intacta
  writeFileSync(join(destino, '.archivada.json'), JSON.stringify({ clave: s.clave, nombre: s.nombre, alcance: s.alcance, clienteId: s.clienteId || '', fecha: new Date(ahora).toISOString() }, null, 2))
  return destino
}

export function listarArchivo(ROOT) {
  const out = []
  let grupos = []
  try { grupos = readdirSync(raizArchivo(ROOT)) } catch { return out }
  for (const g of grupos) {
    let items = []
    try { items = readdirSync(join(raizArchivo(ROOT), g)) } catch { continue }
    for (const it of items) {
      const meta = (() => { try { return JSON.parse(readFileSync(join(raizArchivo(ROOT), g, it, '.archivada.json'), 'utf8')) } catch { return null } })()
      if (meta) out.push({ id: `${g}/${it}`, ...meta })
    }
  }
  return out.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
}

export function restaurar(ROOT, id) {
  const [g, it, ...resto] = String(id || '').split('/')
  if (resto.length || !CLIENTE.test(g || '') || !NOMBRE.test(it || '')) throw new Error('Archivo inválido')
  const origen = join(raizArchivo(ROOT), g, it)
  if (!resolve(origen).startsWith(resolve(raizArchivo(ROOT)) + sep)) throw new Error('Archivo inválido')
  const meta = JSON.parse(readFileSync(join(origen, '.archivada.json'), 'utf8'))
  const destino = meta.alcance === 'cliente' ? join(ROOT, 'skills-clientes', meta.clienteId, meta.nombre) : join(ROOT, '.claude', 'skills', meta.nombre)
  if (meta.alcance === 'cliente' && !CLIENTE.test(meta.clienteId || '')) throw new Error('Archivo inválido')
  if (existsSync(destino)) throw new Error(`Ya hay una skill activa llamada "${meta.nombre}"`)
  mkdirSync(dirname(destino), { recursive: true })
  rmSync(join(origen, '.archivada.json'), { force: true })
  renameSync(origen, destino)
  return { ...meta, destino }
}

// ---------- 6) Informe ----------
export function informe(acciones, { simular, total, respaldo = '' }) {
  const de = (a) => acciones.filter(x => x.accion === a)
  const linea = (x) => `• ${x.alcance === 'cliente' ? `${x.nombre} (cliente ${x.clienteId})` : x.nombre}: ${x.motivo}`
  const partes = [`${simular ? 'Simulación del curador' : 'Curador de skills'}: ${total} skills revisadas.`]
  if (de('archivar').length) partes.push(`${simular ? 'Se archivarían' : 'Archivadas'} (${de('archivar').length}):\n${de('archivar').map(linea).join('\n')}`)
  if (de('inactivar').length) partes.push(`${simular ? 'Pasarían a inactivas' : 'Inactivas'} (${de('inactivar').length}), se archivan si siguen sin uso:\n${de('inactivar').map(linea).join('\n')}`)
  if (de('reactivar').length) partes.push(`Vuelven a estar activas: ${de('reactivar').map(x => x.nombre).join(', ')}`)
  if (!acciones.length) partes.push('Nada que cambiar.')
  if (respaldo) partes.push(`Respaldo previo: ${basename(respaldo)}`)
  if (simular && acciones.some(a => a.accion === 'archivar')) partes.push('Para que archive de verdad, quita "Solo simular" en Agencia → Skills. Para conservar una, fíjala.')
  return partes.join('\n\n')
}

// ---------- 7) Pasada completa ----------
// protegidas: claves o nombres que no se tocan. Devuelve { acciones, texto, respaldo, estado }.
export function pasada({ ROOT, rutaEstado, carpetaRespaldos, protegidas = new Set(), simular = true, ahora = Date.now(), diasInactiva, diasArchivo, instaladas = {} }) {
  const skills = inventario(ROOT)
  const { acciones, estado } = planCuracion({ skills, estado: leerEstado(rutaEstado), protegidas, ahora, diasInactiva, diasArchivo, instaladas })
  let respaldo = ''
  const aplicadas = []
  if (!simular) {
    if (acciones.some(a => a.accion === 'archivar')) respaldo = respaldar(ROOT, carpetaRespaldos, ahora)
    for (const a of acciones) {
      const e = estado.skills[a.clave]
      try {
        if (a.accion === 'archivar') { a.destino = archivar(ROOT, skills.find(s => s.clave === a.clave), ahora); delete estado.skills[a.clave] }
        else if (a.accion === 'inactivar') { e.estado = 'inactiva'; e.inactivaDesde = new Date(ahora).toISOString() }
        else if (a.accion === 'reactivar') { delete e.estado; delete e.inactivaDesde }
        aplicadas.push(a)
      } catch (err) { a.accion = 'error'; a.motivo = err.message; aplicadas.push(a) }
    }
  }
  estado.ultimaPasada = new Date(ahora).toISOString()
  const texto = informe(acciones, { simular, total: skills.length, respaldo })
  estado.ultimoInforme = { fecha: estado.ultimaPasada, simular, texto: texto.slice(0, 3000) }
  // En simulación también se guarda: así queda la "vistaDesde" de cada skill y la fecha de la pasada
  guardarEstado(rutaEstado, estado)
  return { acciones: simular ? acciones : aplicadas, texto, respaldo, estado }
}

// ---------- Uso por terminal: solo simulación ----------
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ROOT = dirname(fileURLToPath(import.meta.url))
  if (!process.argv.includes('--simular')) {
    console.log('Desde la terminal solo se simula: node curador.mjs --simular\nLa pasada real la hace el motor (respeta las skills fijadas y las de rutinas, que están en Firestore).')
    process.exit(1)
  }
  // Copia del estado: la simulación por terminal no debe mover el reloj del motor
  const ruta = join(ROOT, 'logs', 'skills-uso.json')
  const tmp = join(ROOT, 'logs', 'skills-uso.simulacion.json')
  mkdirSync(join(ROOT, 'logs'), { recursive: true })
  writeFileSync(tmp, JSON.stringify(leerEstado(ruta)))
  const r = pasada({ ROOT, rutaEstado: tmp, carpetaRespaldos: '', simular: true })
  rmSync(tmp, { force: true })
  console.log(r.texto)
  console.log('\n(Por terminal no se conocen las skills fijadas ni las de rutinas: el motor las protege en la pasada real.)')
}

