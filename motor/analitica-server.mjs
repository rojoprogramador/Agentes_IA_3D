// Servidor MCP "agentes-analitica" (fase B7): lee GA4 y Search Console del cliente de la tarea, SOLO LECTURA.
// El motor lo declara con --mcp-config para el rol analista y le pasa por variables de entorno:
//   AGENTES_GOOGLE_SA      → JSON de la cuenta de servicio (del cliente o la de la agencia)
//   AGENTES_GA4_PROPIEDAD  → ID de la propiedad GA4 de ESE cliente
//   AGENTES_GSC_SITIO      → sitio de Search Console de ESE cliente
// El agente no puede pedir otra propiedad ni otro sitio: las herramientas no lo reciben como parámetro.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { setDefaultResultOrder } from 'node:dns'
import {
  leerCuentaServicio, firmarJwt, hoyEn, resolverFechas, periodoAnterior, PERIODOS, METRICAS_RESUMEN, cuerpoGa4, filasGa4, comparar,
  DIMENSIONES_GSC, cuerpoGsc, filasGsc, totalesGsc, oportunidades, sitioGsc, propiedadGa4,
} from './analitica.mjs'

setDefaultResultOrder('ipv4first')
const ZONA = process.env.AGENTES_ZONA || 'America/Bogota'
// Direcciones de Google (las pruebas las cambian por un servidor local)
const URL_TOKEN = process.env.AGENTES_GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token'
const URL_GA4 = process.env.AGENTES_GA4_URL || 'https://analyticsdata.googleapis.com/v1beta'
const URL_GSC = process.env.AGENTES_GSC_URL || 'https://searchconsole.googleapis.com/webmasters/v3'
const ok = (o) => ({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o, null, 1) }] })
const fail = (e) => ({ content: [{ type: 'text', text: `Error: ${e?.message || e}` }], isError: true })

let token = null // { valor, vence }
async function acceso() {
  if (token && token.vence > Date.now() + 60_000) return token.valor
  if (!process.env.AGENTES_GOOGLE_SA) throw new Error('Este cliente no tiene credencial de Google cargada (ficha del cliente → Analítica)')
  const cuenta = leerCuentaServicio(process.env.AGENTES_GOOGLE_SA)
  const r = await fetch(URL_TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: firmarJwt(cuenta, undefined, Date.now(), URL_TOKEN) }),
    signal: AbortSignal.timeout(20_000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) throw new Error(`Google rechazó la credencial (${j.error_description || j.error || r.status}). Revisa que la cuenta de servicio exista y no esté deshabilitada.`)
  token = { valor: j.access_token, vence: Date.now() + (j.expires_in || 3600) * 1000 }
  return token.valor
}

async function google(url, cuerpo, que) {
  const r = await fetch(url, {
    method: 'POST', headers: { Authorization: `Bearer ${await acceso()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(60_000),
  })
  const j = await r.json().catch(() => ({}))
  if (r.ok) return j
  const msg = j?.error?.message || r.status
  if (r.status === 403) {
    const email = (() => { try { return leerCuentaServicio(process.env.AGENTES_GOOGLE_SA).email } catch { return 'la cuenta de servicio' } })()
    throw new Error(`Sin permiso en ${que}: el cliente debe agregar a ${email} como ${que === 'GA4' ? 'Lector (Administrar → Gestión de acceso a la propiedad)' : 'usuario Restringido (Configuración → Usuarios y permisos)'}. Detalle: ${msg}`)
  }
  throw new Error(`${que} respondió ${r.status}: ${String(msg).slice(0, 300)}`)
}

const propiedad = () => propiedadGa4(process.env.AGENTES_GA4_PROPIEDAD)
const sitio = () => sitioGsc(process.env.AGENTES_GSC_SITIO)
const ga4 = (cuerpo) => google(`${URL_GA4}/properties/${propiedad()}:runReport`, cuerpo, 'GA4')
const gsc = (cuerpo) => google(`${URL_GSC}/sites/${encodeURIComponent(sitio())}/searchAnalytics/query`, cuerpo, 'Search Console')
const fechasSchema = {
  periodo: z.enum(PERIODOS).optional().describe('Periodo relativo (por defecto ultimos_28). mes_pasado para el informe mensual.'),
  desde: z.string().optional().describe('AAAA-MM-DD (en vez de periodo)'), hasta: z.string().optional(),
}

const server = new McpServer({ name: 'agentes-analitica', version: '1.0.0' })

server.tool('estado_analitica',
  'Dice si este cliente tiene GA4 y Search Console conectados (propiedad, sitio y cuenta de servicio) y prueba el acceso. Úsala primero.',
  {},
  async () => {
    const out = { ga4: null, searchConsole: null, cuenta: null, zona: ZONA, hoy: hoyEn(ZONA) }
    try { out.cuenta = leerCuentaServicio(process.env.AGENTES_GOOGLE_SA || '').email } catch (e) { out.cuenta = `Sin credencial: ${e.message}` }
    const { desde, hasta } = resolverFechas({ periodo: 'ultimos_7' }, out.hoy)
    try { propiedad(); await ga4(cuerpoGa4({ metricas: ['sessions'], desde, hasta, limite: 1 })); out.ga4 = `Conectado (propiedad ${propiedad()})` } catch (e) { out.ga4 = e.message }
    try { sitio(); await gsc(cuerpoGsc({ desde, hasta, dimension: 'date', limite: 1 })); out.searchConsole = `Conectado (${sitio()})` } catch (e) { out.searchConsole = e.message }
    return ok(out)
  })

server.tool('ga4_resumen',
  'Totales de GA4 del periodo (usuarios, sesiones, interacción, vistas, eventos clave) comparados con el periodo anterior de igual duración.',
  { ...fechasSchema, comparar: z.boolean().default(true) },
  async ({ periodo, desde, hasta, comparar: conComparacion }) => {
    try {
      const r = resolverFechas({ periodo, desde, hasta }, hoyEn(ZONA))
      const leer = async (f) => filasGa4(await ga4(cuerpoGa4({ metricas: METRICAS_RESUMEN, ...f, limite: 1 }))).filas[0] || {}
      const actual = await leer(r)
      const ant = conComparacion ? periodoAnterior(r.desde, r.hasta) : null
      const anterior = ant ? await leer(ant) : null
      return ok({ periodo: r, comparadoCon: ant, metricas: comparar(actual, anterior), nota: 'engagementRate va de 0 a 1; averageSessionDuration en segundos.' })
    } catch (e) { return fail(e) }
  })

server.tool('ga4_reporte',
  'Reporte de GA4 con dimensiones y métricas de la API (ej. dimensiones sessionDefaultChannelGroup, pagePath, deviceCategory, city, date, eventName; métricas sessions, activeUsers, keyEvents, engagementRate, screenPageViews).',
  { ...fechasSchema, dimensiones: z.array(z.string()).max(4).default([]), metricas: z.array(z.string()).min(1).max(10), limite: z.number().int().min(1).max(250).default(25), ordenar_por: z.string().optional() },
  async ({ periodo, desde, hasta, dimensiones, metricas, limite, ordenar_por }) => {
    try {
      const r = resolverFechas({ periodo, desde, hasta }, hoyEn(ZONA))
      return ok({ periodo: r, ...filasGa4(await ga4(cuerpoGa4({ dimensiones, metricas, ...r, limite, ordenarPor: ordenar_por }))) })
    } catch (e) { return fail(e) }
  })

server.tool('gsc_rendimiento',
  'Search Console: clics, impresiones, CTR y posición por búsqueda (query), página, país, dispositivo o fecha, con totales comparados con el periodo anterior. Los datos tienen 2–3 días de retraso.',
  { ...fechasSchema, dimension: z.enum(DIMENSIONES_GSC).default('query'), limite: z.number().int().min(1).max(500).default(25), comparar: z.boolean().default(true) },
  async ({ periodo, desde, hasta, dimension, limite, comparar: conComparacion }) => {
    try {
      const r = resolverFechas({ periodo, desde, hasta }, hoyEn(ZONA))
      const filas = filasGsc(await gsc(cuerpoGsc({ ...r, dimension, limite })), dimension)
      // Los totales salen de la dimensión fecha (todas las filas), no del top de búsquedas
      const total = async (f) => totalesGsc(filasGsc(await gsc(cuerpoGsc({ ...f, dimension: 'date', limite: 500 })), 'date'))
      const ant = conComparacion ? periodoAnterior(r.desde, r.hasta) : null
      const [tAct, tAnt] = await Promise.all([total(r), ant ? total(ant) : null])
      return ok({ periodo: r, comparadoCon: ant, totales: comparar(tAct, tAnt), filas })
    } catch (e) { return fail(e) }
  })

server.tool('gsc_oportunidades',
  'Búsquedas en las que el sitio ya aparece en posiciones 4–20 con muchas impresiones y pocos clics: lo más rápido de mejorar (título, descripción, contenido de esa página).',
  { ...fechasSchema, min_impresiones: z.number().int().min(1).default(50) },
  async ({ periodo, desde, hasta, min_impresiones }) => {
    try {
      const r = resolverFechas({ periodo: periodo || 'ultimos_90', desde, hasta }, hoyEn(ZONA))
      // Con dos dimensiones, keys = [búsqueda, página]: así se sabe qué página mejorar
      const resp = await gsc({ ...cuerpoGsc({ ...r, dimension: 'query', limite: 1000 }), dimensions: ['query', 'page'] })
      const filas = filasGsc(resp, 'query')
      const conPagina = (resp.rows || []).map((x, i) => ({ ...filas[i], pagina: x.keys?.[1] || '' }))
      return ok({ periodo: r, oportunidades: oportunidades(conPagina, { minImpresiones: min_impresiones }) })
    } catch (e) { return fail(e) }
  })

await server.connect(new StdioServerTransport())
