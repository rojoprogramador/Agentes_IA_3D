// Seguridad pasiva (fase B6). Funciones puras que usa seguridad-server.mjs y prueba seguridad.test.mjs.
//
// Regla de oro: NADA se escanea si no está en el alcance firmado por el cliente (clients.alcanceAutorizado),
// dentro de su vigencia y, si toca el sistema en vivo, dentro de su ventana horaria. El alcance lo pone el motor
// desde Firestore (solo un admin lo edita); el agente solo pide "tipo + objetivo".
//
// Cada escaneo corre en un contenedor Docker efímero y endurecido (--rm, sin capacidades, raíz de solo lectura,
// sin privilegios nuevos, usuario no root, CPU/memoria/procesos limitados) y uno a la vez en todo el PC.
// Solo pruebas PASIVAS: análisis de código y dependencias (no toca producción), TLS y ZAP baseline (observa, no ataca).
import { isIP } from 'node:net'

// ---------- Tipos de escaneo ----------
// vivo: toca el sistema del cliente en internet (exige ventana horaria). red: el contenedor necesita internet
// (bases de vulnerabilidades o el objetivo); gitleaks corre sin red.
export const TIPOS = {
  secretos:         { herramienta: 'gitleaks',    objetivo: 'repo', vivo: false, red: false, nombre: 'Claves y contraseñas filtradas en el código y su historial' },
  dependencias:     { herramienta: 'osv-scanner', objetivo: 'repo', vivo: false, red: true,  nombre: 'Librerías con vulnerabilidades conocidas (OSV)' },
  codigo:           { herramienta: 'semgrep',     objetivo: 'repo', vivo: false, red: true,  nombre: 'Análisis estático del código (reglas OWASP Top 10)' },
  vulnerabilidades: { herramienta: 'trivy',       objetivo: 'repo', vivo: false, red: true,  nombre: 'Dependencias, configuración (Docker, IaC) y secretos con Trivy' },
  tls:              { herramienta: 'testssl',     objetivo: 'host', vivo: true,  red: true,  nombre: 'Configuración TLS/SSL del dominio' },
  web_pasivo:       { herramienta: 'zap',         objetivo: 'url',  vivo: true,  red: true,  nombre: 'ZAP baseline: encabezados y configuración web (sin ataques)' },
}

// Imágenes con versión fija: lo que se probó es lo que corre
export const IMAGENES = {
  gitleaks: 'zricethezav/gitleaks:v8.21.2',
  'osv-scanner': 'ghcr.io/google/osv-scanner:v1.9.1',
  semgrep: 'semgrep/semgrep:1.97.0',
  trivy: 'aquasec/trivy:0.57.1',
  testssl: 'drwetter/testssl.sh:3.2',
  zap: 'ghcr.io/zaproxy/zaproxy:2.15.0',
}

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const sinTilde = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const lista = (x) => (Array.isArray(x) ? x : String(x || '').split(/[\n,]+/)).map(s => String(s).trim()).filter(Boolean)

// Hora y día de la semana en la zona del alcance (Colombia por defecto)
function enZona(ahora, zona) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
  const p = Object.fromEntries(f.formatToParts(new Date(ahora)).map(x => [x.type, x.value]))
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  return { fecha: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}`, dia: DIAS[dia] }
}

// ¿Está vigente el alcance para este tipo de escaneo, en este momento?
export function alcanceVigente(a, tipo, ahora = Date.now(), zona = 'America/Bogota') {
  if (!a || typeof a !== 'object') return { ok: false, motivo: 'El cliente no tiene alcance de seguridad cargado en su ficha' }
  if (!String(a.autorizadoPor || '').trim()) return { ok: false, motivo: 'El alcance no tiene firmante (Autorizado por)' }
  if (!String(a.documento || '').trim()) return { ok: false, motivo: 'Falta el enlace al documento de autorización firmado' }
  const t = enZona(ahora, zona)
  const desde = a.vigenciaDesde || a.fecha
  if (!desde || !a.vigenciaHasta) return { ok: false, motivo: 'El alcance no tiene vigencia (desde y hasta)' }
  if (t.fecha < desde) return { ok: false, motivo: `La autorización empieza el ${desde}` }
  if (t.fecha > a.vigenciaHasta) return { ok: false, motivo: `La autorización venció el ${a.vigenciaHasta}: hay que firmar otra` }
  if ((Date.parse(a.vigenciaHasta) - Date.parse(desde)) / 86400000 > 90) return { ok: false, motivo: 'La vigencia no puede pasar de 90 días (así lo dice la plantilla)' }
  if (TIPOS[tipo]?.vivo) {
    const v = a.ventana || {}
    const dias = lista(v.dias).map(sinTilde)
    if (!dias.length || !v.desde || !v.hasta) return { ok: false, motivo: 'Las pruebas sobre el sitio en vivo necesitan una ventana horaria en el alcance' }
    if (!dias.includes(t.dia)) return { ok: false, motivo: `Hoy (${t.dia}) no está en la ventana autorizada (${dias.join(', ')})` }
    const dentro = v.desde <= v.hasta ? (t.hhmm >= v.desde && t.hhmm < v.hasta) : (t.hhmm >= v.desde || t.hhmm < v.hasta)
    if (!dentro) return { ok: false, motivo: `Son las ${t.hhmm}: fuera de la ventana autorizada (${v.desde}–${v.hasta}, ${zona})` }
  }
  return { ok: true }
}

// ---------- ¿El objetivo está en el alcance? ----------
const ipANum = (ip) => ip.split('.').reduce((n, x) => n * 256 + Number(x), 0)
export function ipEnLista(ip, entradas) {
  if (isIP(ip) !== 4) return lista(entradas).some(e => e.toLowerCase() === String(ip).toLowerCase())
  return lista(entradas).some(e => {
    const [base, bits] = e.split('/')
    if (isIP(base) !== 4) return false
    if (bits === undefined) return base === ip
    const b = Number(bits)
    if (!Number.isInteger(b) || b < 8 || b > 32) return false // rangos más grandes que /8 no se aceptan
    const mascara = b === 0 ? 0 : (~0 << (32 - b)) >>> 0
    return ((ipANum(ip) & mascara) >>> 0) === ((ipANum(base) & mascara) >>> 0)
  })
}

export function hostEnAlcance(host, a) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '')
  if (isIP(h)) return ipEnLista(h, a?.ips)
  return lista(a?.dominios).some(d => {
    const dom = d.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '')
    if (dom.startsWith('*.')) return h.endsWith(dom.slice(1)) && h !== dom.slice(2)
    return h === dom || (a?.subdominios === true && h.endsWith('.' + dom))
  })
}

// Repos: se comparan normalizados (https, sin .git ni barra final, sin mayúsculas)
export const normalizarRepo = (r) => String(r || '').trim().toLowerCase().replace(/^git@([^:]+):/, 'https://$1/').replace(/^http:\/\//, 'https://')
  .replace(/\.git$/, '').replace(/\/+$/, '')

export function objetivoEnAlcance(tipo, objetivo, a) {
  const def = TIPOS[tipo]
  if (!def) return { ok: false, motivo: `Tipo de escaneo desconocido. Usa: ${Object.keys(TIPOS).join(', ')}` }
  const o = String(objetivo || '').trim()
  if (def.objetivo === 'repo') {
    const r = normalizarRepo(o)
    if (!/^https:\/\/[a-z0-9.-]+\/[\w.-]+\/[\w.-]+$/.test(r)) return { ok: false, motivo: 'El repositorio debe ser una URL https://servidor/dueño/repo' }
    if (!lista(a?.repos).map(normalizarRepo).includes(r)) return { ok: false, motivo: `${o} no está en los repositorios autorizados del cliente` }
    return { ok: true, objetivo: r }
  }
  let u
  try { u = new URL(/^https?:\/\//.test(o) ? o : `https://${o}`) } catch { return { ok: false, motivo: 'Objetivo inválido' } }
  if (u.username || u.password) return { ok: false, motivo: 'El objetivo no puede llevar usuario ni contraseña' }
  if (u.port && !['80', '443'].includes(u.port)) return { ok: false, motivo: 'Solo puertos web (80 y 443)' }
  if (!hostEnAlcance(u.hostname, a)) return { ok: false, motivo: `${u.hostname} no está en los dominios o IPs autorizados del cliente` }
  return { ok: true, objetivo: def.objetivo === 'host' ? u.hostname : `${u.protocol}//${u.host}${u.pathname}` }
}

// ---------- Contenedor endurecido ----------
// montajes: { src (repo, solo lectura), out (resultados) }. uid/gid: el del usuario del PC (no root), para que
// los resultados queden con su dueño.
export function argsDocker(tipo, objetivo, { src = '', out, uid = 1000, gid = 1000, cache = '' } = {}) {
  const def = TIPOS[tipo]
  if (!def) throw new Error('Tipo desconocido')
  if (!out) throw new Error('Falta la carpeta de resultados')
  if (!uid) throw new Error('Los escaneos no corren como root')
  const tmp = '512m'
  const base = [
    'run', '--rm', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only',
    '--tmpfs', `/tmp:rw,exec,size=${tmp}`, '--user', `${uid}:${gid}`, '--cpus', '1', '--memory', '2g', '--pids-limit', '256',
    '--network', def.red ? 'bridge' : 'none', '-e', 'HOME=/tmp',
    '-v', `${out}:/out:rw`, ...(def.objetivo === 'repo' ? ['-v', `${src}:/src:ro`] : []),
  ]
  const img = IMAGENES[def.herramienta]
  switch (def.herramienta) {
    case 'gitleaks': return [...base, img, 'git', '/src', '--redact', '--no-banner', '--exit-code', '0', '--report-format', 'json', '--report-path', '/out/gitleaks.json']
    case 'osv-scanner': return [...base, img, '--format', 'json', '--output', '/out/osv.json', '-r', '/src']
    case 'semgrep': return [...base, '-e', 'SEMGREP_SEND_METRICS=off', '-e', 'XDG_CONFIG_HOME=/tmp', img, 'semgrep', 'scan', '--config', 'p/owasp-top-ten', '--config', 'p/secrets', '--json', '--output', '/out/semgrep.json', '--metrics', 'off', '--timeout', '30', '/src']
    // La base de Trivy (~1 GB descomprimida) va en una caché del PC: no cabe en /tmp y así no se baja en cada escaneo
    case 'trivy': if (!cache) throw new Error('Trivy necesita una carpeta de caché')
      return [...base, '-v', `${cache}:/cache:rw`, img, 'fs', '--scanners', 'vuln,misconfig,secret', '--cache-dir', '/cache', '--format', 'json', '--output', '/out/trivy.json', '--quiet', '/src']
    case 'testssl': return [...base, img, '--jsonfile', '/out/testssl.json', '--quiet', '--color', '0', '--warnings', 'off', '--sneaky', `${objetivo}:443`]
    case 'zap': return [...base, '-w', '/zap/wrk', '--tmpfs', '/home/zap:rw,size=512m,mode=1777', '-v', `${out}:/zap/wrk:rw`, img, 'zap-baseline.py', '-t', objetivo, '-J', 'zap.json', '-m', '2', '-I']
    default: throw new Error('Herramienta desconocida')
  }
}

// ---------- OWASP Top 10:2025 ----------
export const OWASP_2025 = {
  A01: 'Control de acceso roto', A02: 'Configuración de seguridad incorrecta', A03: 'Fallas en la cadena de suministro de software',
  A04: 'Fallas criptográficas', A05: 'Inyección', A06: 'Diseño inseguro', A07: 'Fallas de autenticación',
  A08: 'Fallas de integridad de software o datos', A09: 'Fallas de registro y alertas', A10: 'Manejo incorrecto de condiciones excepcionales',
}
// Las reglas (semgrep) todavía vienen etiquetadas con la lista de 2021
const DE_2021 = { A01: 'A01', A02: 'A04', A03: 'A05', A04: 'A06', A05: 'A02', A06: 'A03', A07: 'A07', A08: 'A08', A09: 'A09', A10: 'A01' }
export function owaspDe2021(etiquetas) {
  for (const e of [].concat(etiquetas || [])) {
    const m = String(e).match(/A(\d{2}):(\d{4})/)
    if (!m) continue
    const id = `A${m[1]}`
    return m[2] === '2025' ? id : DE_2021[id] || null
  }
  return null
}

// ---------- Lectura de resultados (formato común) ----------
// Hallazgo: { severidad: critica|alta|media|baja|info, titulo, ubicacion, detalle, owasp, referencia }
const SEV = (s) => {
  const x = String(s || '').toLowerCase()
  if (/crit/.test(x)) return 'critica'
  if (/high|error|alta/.test(x)) return 'alta'
  if (/med|moderate|warn/.test(x)) return 'media'
  if (/low|baja/.test(x)) return 'baja'
  return 'info'
}
const ORDEN = { critica: 0, alta: 1, media: 2, baja: 3, info: 4 }
const corta = (s, n = 200) => { const x = String(s ?? '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n) + '…' : x }
const sinRuta = (p) => String(p || '').replace(/^\/src\/?/, '')

function cerrar(herramienta, hallazgos, extra = {}) {
  hallazgos.sort((a, b) => ORDEN[a.severidad] - ORDEN[b.severidad])
  const totales = { critica: 0, alta: 0, media: 0, baja: 0, info: 0 }
  for (const h of hallazgos) totales[h.severidad]++
  return { herramienta, totales, total: hallazgos.length, hallazgos: hallazgos.slice(0, 60), ...extra }
}

export function leerGitleaks(j) {
  // Nunca se devuelve el secreto: gitleaks corre con --redact y además aquí se ignoran Secret y Match
  return cerrar('gitleaks', [].concat(j || []).map(x => ({
    severidad: 'alta', owasp: 'A07', titulo: `Posible secreto: ${x.Description || x.RuleID}`,
    ubicacion: `${sinRuta(x.File)}:${x.StartLine}${x.Commit ? ` (commit ${String(x.Commit).slice(0, 8)})` : ''}`,
    detalle: 'Rota la clave aunque ya no esté en el código: sigue en el historial de git.', referencia: x.RuleID,
  })))
}

export function leerOsv(j) {
  const out = []
  for (const r of j?.results || []) for (const p of r.packages || []) {
    const grupos = new Map((p.groups || []).map(g => [g.ids?.[0], g.max_severity]))
    for (const v of p.vulnerabilities || []) {
      const cvss = Number(grupos.get(v.id) || v.database_specific?.cvss_score || 0)
      const sev = v.database_specific?.severity ? SEV(v.database_specific.severity) : cvss >= 9 ? 'critica' : cvss >= 7 ? 'alta' : cvss >= 4 ? 'media' : cvss > 0 ? 'baja' : 'media'
      out.push({ severidad: sev, owasp: 'A03', titulo: `${p.package?.name}@${p.package?.version}: ${corta(v.summary || v.id, 120)}`,
        ubicacion: sinRuta(r.source?.path), detalle: `Ecosistema ${p.package?.ecosystem}. Actualiza a una versión corregida.`, referencia: [v.id, ...(v.aliases || [])].slice(0, 3).join(', ') })
    }
  }
  return cerrar('osv-scanner', out)
}

export function leerSemgrep(j) {
  return cerrar('semgrep', (j?.results || []).map(r => ({
    severidad: SEV(r.extra?.severity), owasp: owaspDe2021(r.extra?.metadata?.owasp) || 'A06',
    titulo: corta(r.extra?.message || r.check_id, 160), ubicacion: `${sinRuta(r.path)}:${r.start?.line}`,
    detalle: [].concat(r.extra?.metadata?.cwe || []).slice(0, 2).join('; '), referencia: r.check_id,
  })), { erroresHerramienta: (j?.errors || []).length })
}

export function leerTrivy(j) {
  const out = []
  for (const r of j?.Results || []) {
    for (const v of r.Vulnerabilities || []) out.push({ severidad: SEV(v.Severity), owasp: 'A03',
      titulo: `${v.PkgName}@${v.InstalledVersion}: ${corta(v.Title || v.VulnerabilityID, 120)}`, ubicacion: sinRuta(r.Target),
      detalle: v.FixedVersion ? `Corregido en ${v.FixedVersion}` : 'Sin versión corregida todavía', referencia: v.VulnerabilityID })
    for (const m of r.Misconfigurations || []) if (m.Status !== 'PASS') out.push({ severidad: SEV(m.Severity), owasp: 'A02',
      titulo: corta(m.Title || m.ID, 140), ubicacion: sinRuta(r.Target), detalle: corta(m.Resolution || m.Message, 200), referencia: m.AVDID || m.ID })
    for (const s of r.Secrets || []) out.push({ severidad: SEV(s.Severity), owasp: 'A07',
      titulo: `Posible secreto: ${s.Title || s.RuleID}`, ubicacion: `${sinRuta(r.Target)}:${s.StartLine}`, detalle: 'Rota la clave.', referencia: s.RuleID })
  }
  return cerrar('trivy', out)
}

// Mensajes de la propia herramienta (no son hallazgos del sitio)
const RUIDO_TESTSSL = /^(engine_problem|cmdline_|scanProblem|scanTime|pre_|optimal_proto|service|clientsimulation|DNS_CAArecord$)/
export function leerTestssl(j) {
  const filas = Array.isArray(j) ? j : (j?.scanResult || []).flatMap(s => Object.values(s).filter(Array.isArray).flat())
  const vistos = new Set() // el mismo dominio con varias IP repite cada hallazgo
  const unicas = filas.filter(f => {
    if (['OK', 'INFO', 'DEBUG'].includes(String(f.severity).toUpperCase()) || !f.finding || RUIDO_TESTSSL.test(f.id)) return false
    const k = `${f.id}|${f.finding}`
    if (vistos.has(k)) return false
    vistos.add(k); return true
  })
  return cerrar('testssl', unicas.map(f => ({
    severidad: SEV(f.severity === 'WARN' ? 'low' : f.severity), owasp: 'A04', titulo: `${f.id}: ${corta(f.finding, 140)}`,
    ubicacion: `${f.ip || ''}:${f.port || 443}`, detalle: f.cve ? `CVE: ${f.cve}` : '', referencia: f.id,
  })))
}

const RIESGO_ZAP = { 3: 'alta', 2: 'media', 1: 'baja', 0: 'info' }
export function leerZap(j) {
  const out = []
  for (const s of j?.site || []) for (const a of s.alerts || []) {
    if (String(a.pluginid) === '10116') continue // "ZAP is Out of Date": es de la herramienta, no del sitio
    const cwe = Number(a.cweid)
    out.push({ severidad: RIESGO_ZAP[Number(a.riskcode)] || 'info', owasp: [319, 311, 326, 327].includes(cwe) ? 'A04' : 'A02',
      titulo: a.name || a.alert, ubicacion: `${s['@name'] || ''} (${a.count || a.instances?.length || 1} URL)`,
      detalle: corta(String(a.solution || '').replace(/<[^>]+>/g, ' '), 220), referencia: `ZAP ${a.pluginid}${cwe > 0 ? ` · CWE-${cwe}` : ''}` })
  }
  return cerrar('zap', out)
}

export const LECTORES = { gitleaks: ['gitleaks.json', leerGitleaks], 'osv-scanner': ['osv.json', leerOsv], semgrep: ['semgrep.json', leerSemgrep], trivy: ['trivy.json', leerTrivy], testssl: ['testssl.json', leerTestssl], zap: ['zap.json', leerZap] }

// ---------- Uno a la vez en todo el PC ----------
// El candado es un archivo con el PID; si ese proceso ya no existe, el candado está huérfano y se puede tomar.
export function candadoLibre(contenido, pidVivo) {
  const pid = Number(String(contenido || '').trim().split(/\s+/)[0])
  return !pid || !pidVivo(pid)
}
