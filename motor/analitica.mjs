// Analítica (fase B7): GA4 y Search Console con credenciales de SOLO LECTURA por cliente.
// Funciones puras (más la firma JWT con node:crypto) que usa analitica-server.mjs y prueba analitica.test.mjs.
//
// Credencial: una cuenta de servicio de Google (JSON). El cliente le da acceso de "Lector" en su propiedad de GA4 y
// "Restringido" en Search Console. El motor la inyecta SOLO en tareas de ese cliente, junto con el ID de su propiedad
// y su sitio: el agente no elige qué propiedad leer.
import { createSign } from 'node:crypto'

export const ALCANCES_GOOGLE = ['https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/webmasters.readonly']

// ---------- Cuenta de servicio ----------
export function leerCuentaServicio(texto) {
  let j
  try { j = typeof texto === 'string' ? JSON.parse(texto) : texto } catch { throw new Error('La credencial no es un JSON válido') }
  if (j?.type !== 'service_account') throw new Error('El JSON debe ser de una cuenta de servicio (type: service_account)')
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(j.client_email || '')) throw new Error('Falta client_email de la cuenta de servicio')
  if (!/-----BEGIN PRIVATE KEY-----/.test(j.private_key || '')) throw new Error('Falta la clave privada (private_key)')
  return { email: j.client_email, clave: j.private_key, tokenUri: j.token_uri || 'https://oauth2.googleapis.com/token' }
}

const b64url = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url')
// JWT firmado (RS256) para cambiarlo por un token de acceso de Google (OAuth 2.0 para cuentas de servicio)
export function firmarJwt(cuenta, alcances = ALCANCES_GOOGLE, ahora = Date.now(), aud = cuenta.tokenUri) {
  const iat = Math.floor(ahora / 1000)
  const cuerpo = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iss: cuenta.email, scope: alcances.join(' '), aud, iat, exp: iat + 3600 })}`
  const firma = createSign('RSA-SHA256').update(cuerpo).sign(cuenta.clave).toString('base64url')
  return `${cuerpo}.${firma}`
}

// ---------- Fechas ----------
const ymd = (d) => d.toISOString().slice(0, 10)
const dia = (s) => new Date(`${s}T00:00:00Z`)
const mas = (s, n) => { const d = dia(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d) }
export const FECHA = /^\d{4}-\d{2}-\d{2}$/

// "Hoy" en la zona del negocio (un informe del 1 de mes a las 7 p. m. en Colombia ya es día 2 en UTC)
export function hoyEn(zona = 'America/Bogota', ahora = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ahora))
}

export const PERIODOS = ['ultimos_7', 'ultimos_28', 'ultimos_90', 'mes_pasado', 'mes_actual', 'anio_actual']
export function rangoFechas(periodo, hoy) {
  const ayer = mas(hoy, -1)
  switch (periodo) {
    case 'ultimos_7': return { desde: mas(hoy, -7), hasta: ayer }
    case 'ultimos_28': return { desde: mas(hoy, -28), hasta: ayer }
    case 'ultimos_90': return { desde: mas(hoy, -90), hasta: ayer }
    case 'mes_actual': return { desde: `${hoy.slice(0, 8)}01`, hasta: ayer < `${hoy.slice(0, 8)}01` ? `${hoy.slice(0, 8)}01` : ayer }
    case 'mes_pasado': { const primero = `${hoy.slice(0, 8)}01`; const fin = mas(primero, -1); return { desde: `${fin.slice(0, 8)}01`, hasta: fin } }
    case 'anio_actual': return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: ayer }
    default: throw new Error(`Periodo desconocido. Usa: ${PERIODOS.join(', ')} o desde/hasta`)
  }
}

// Mismo número de días justo antes (para comparar). Para un mes completo, el mes anterior completo.
export function periodoAnterior(desde, hasta) {
  if (desde.endsWith('-01') && mas(hasta, 1).endsWith('-01')) {
    const fin = mas(desde, -1)
    return { desde: `${fin.slice(0, 8)}01`, hasta: fin }
  }
  const dias = Math.round((dia(hasta) - dia(desde)) / 86400000) + 1
  return { desde: mas(desde, -dias), hasta: mas(desde, -1) }
}

export function resolverFechas({ periodo, desde, hasta }, hoy) {
  if (desde || hasta) {
    if (!FECHA.test(desde || '') || !FECHA.test(hasta || '')) throw new Error('desde y hasta van en formato AAAA-MM-DD')
    if (desde > hasta) throw new Error('desde debe ser anterior a hasta')
    if (hasta > hoy) throw new Error('hasta no puede ser una fecha futura')
    if ((dia(hasta) - dia(desde)) / 86400000 > 16 * 31) throw new Error('El rango máximo es de 16 meses (lo que guarda Search Console)')
    return { desde, hasta }
  }
  return rangoFechas(periodo || 'ultimos_28', hoy)
}

// ---------- GA4 ----------
// Nombres de la API (no se inventan): solo letras, números, ":" y "_" (customEvent:xxx incluido)
export const CAMPO_GA4 = /^[a-zA-Z][a-zA-Z0-9_:]{1,79}$/
export const METRICAS_RESUMEN = ['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'engagementRate', 'averageSessionDuration', 'screenPageViews', 'keyEvents']
export const NOMBRES_METRICAS = {
  activeUsers: 'Usuarios activos', newUsers: 'Usuarios nuevos', sessions: 'Sesiones', engagedSessions: 'Sesiones con interacción',
  engagementRate: 'Tasa de interacción', averageSessionDuration: 'Duración media de la sesión (s)', screenPageViews: 'Vistas de página',
  keyEvents: 'Eventos clave (conversiones)', totalRevenue: 'Ingresos',
}

export function cuerpoGa4({ dimensiones = [], metricas, desde, hasta, limite = 25, ordenarPor }) {
  const dims = dimensiones.slice(0, 4), mets = metricas.slice(0, 10)
  for (const c of [...dims, ...mets]) if (!CAMPO_GA4.test(c)) throw new Error(`Nombre de campo inválido: ${c}`)
  if (!mets.length) throw new Error('Pide al menos una métrica')
  const orden = ordenarPor && mets.includes(ordenarPor) ? [{ metric: { metricName: ordenarPor }, desc: true }]
    : dims.includes('date') ? [{ dimension: { dimensionName: 'date' } }] : [{ metric: { metricName: mets[0] }, desc: true }]
  return {
    dateRanges: [{ startDate: desde, endDate: hasta }], dimensions: dims.map(name => ({ name })), metrics: mets.map(name => ({ name })),
    limit: Math.min(Math.max(1, limite), 250), orderBys: orden, keepEmptyRows: false,
  }
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : v }
export function filasGa4(resp) {
  const dims = (resp?.dimensionHeaders || []).map(h => h.name), mets = (resp?.metricHeaders || []).map(h => h.name)
  const filas = (resp?.rows || []).map(r => Object.fromEntries([
    ...dims.map((d, i) => [d, r.dimensionValues?.[i]?.value ?? '']),
    ...mets.map((m, i) => [m, num(r.metricValues?.[i]?.value ?? 0)]),
  ]))
  return { filas, totalFilas: resp?.rowCount ?? filas.length }
}

const redondear = (n) => (Math.abs(n) < 10 ? Math.round(n * 1000) / 1000 : Math.round(n * 10) / 10)
export function comparar(actual, anterior) {
  const out = {}
  for (const [k, v] of Object.entries(actual)) {
    if (typeof v !== 'number') continue
    const a = typeof anterior?.[k] === 'number' ? anterior[k] : null
    out[k] = { nombre: NOMBRES_METRICAS[k] || k, valor: redondear(v), anterior: a === null ? null : redondear(a), cambioPct: a ? Math.round(((v - a) / a) * 1000) / 10 : null }
  }
  return out
}

// ---------- Search Console ----------
export const DIMENSIONES_GSC = ['query', 'page', 'country', 'device', 'date', 'searchAppearance']
export function cuerpoGsc({ desde, hasta, dimension = 'query', limite = 25, tipo = 'web' }) {
  if (!DIMENSIONES_GSC.includes(dimension)) throw new Error(`Dimensión inválida. Usa: ${DIMENSIONES_GSC.join(', ')}`)
  return { startDate: desde, endDate: hasta, dimensions: [dimension], rowLimit: Math.min(Math.max(1, limite), 1000), type: tipo, dataState: 'final' }
}

export function filasGsc(resp, dimension) {
  return (resp?.rows || []).map(r => ({
    [dimension]: r.keys?.[0] ?? '', clics: r.clicks || 0, impresiones: r.impressions || 0,
    ctrPct: Math.round((r.ctr || 0) * 1000) / 10, posicion: Math.round((r.position || 0) * 10) / 10,
  }))
}

export function totalesGsc(filas) {
  const clics = filas.reduce((s, f) => s + f.clics, 0), impresiones = filas.reduce((s, f) => s + f.impresiones, 0)
  const pos = impresiones ? filas.reduce((s, f) => s + f.posicion * f.impresiones, 0) / impresiones : 0
  return { clics, impresiones, ctrPct: impresiones ? Math.round((clics / impresiones) * 1000) / 10 : 0, posicionMedia: Math.round(pos * 10) / 10 }
}

// Búsquedas "casi": aparecen bastante (impresiones) en posiciones 4–20 con pocos clics. Mejorar el título,
// la descripción o el contenido de esa página es lo que más rápido suele traer clics.
export function oportunidades(filas, { minImpresiones = 50 } = {}) {
  return filas.filter(f => f.posicion >= 4 && f.posicion <= 20 && f.impresiones >= minImpresiones)
    .map(f => ({ ...f, potencial: Math.round(f.impresiones * (f.posicion <= 10 ? 0.05 : 0.02)) - f.clics }))
    .filter(f => f.potencial > 0).sort((a, b) => b.potencial - a.potencial).slice(0, 20)
}

// Sitio de Search Console: "sc-domain:ejemplo.com" o un prefijo de URL con barra final
export function sitioGsc(s) {
  const x = String(s || '').trim()
  if (/^sc-domain:[a-z0-9.-]+\.[a-z]{2,}$/i.test(x)) return x.toLowerCase()
  if (/^https?:\/\/[^\s/]+(\/[^\s]*)?$/i.test(x)) return x.endsWith('/') ? x : x + '/'
  throw new Error('El sitio de Search Console va como sc-domain:ejemplo.com o https://www.ejemplo.com/')
}
export const propiedadGa4 = (p) => { const x = String(p || '').replace(/^properties\//, '').trim(); if (!/^\d{6,12}$/.test(x)) throw new Error('El ID de propiedad de GA4 son solo números (Administrar → Detalles de la propiedad)'); return x }
