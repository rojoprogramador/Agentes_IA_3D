// Servidor MCP "agentes-ads" (fase C1): Google Ads y Meta Ads del cliente de la tarea, SOLO LECTURA.
// El motor lo declara para el rol paid_media y le pasa por entorno, solo del cliente de esa tarea:
//   AGENTES_GADS_CRED (JSON developer_token/client_id/client_secret/refresh_token) y AGENTES_GADS_CID
//   AGENTES_META_TOKEN y AGENTES_META_CUENTA
//   AGENTES_ADS_TOPE (tope de gasto mensual acordado con el cliente)
// No existe ninguna herramienta que cree, pause o cambie campañas: el agente audita y propone.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { setDefaultResultOrder } from 'node:dns'
import { hoyEn, resolverFechas, PERIODOS } from './analitica.mjs'
import { VERSION_GOOGLE_ADS, VERSION_META, leerCredGoogleAds, cidValido, cuentaMetaValida, gaqlCampanas, gaqlTerminos, campanasGoogle, terminosGoogle, camposInsightsMeta, campanasMeta, auditar } from './ads.mjs'

setDefaultResultOrder('ipv4first')
const ZONA = process.env.AGENTES_ZONA || 'America/Bogota'
const URL_TOKEN = process.env.AGENTES_GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token'
const URL_GADS = process.env.AGENTES_GADS_URL || `https://googleads.googleapis.com/${VERSION_GOOGLE_ADS}`
const URL_META = process.env.AGENTES_META_URL || `https://graph.facebook.com/${VERSION_META}`
const ok = (o) => ({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o, null, 1) }] })
const fail = (e) => ({ content: [{ type: 'text', text: `Error: ${e?.message || e}` }], isError: true })

let tokenGoogle = null
async function accesoGoogle(cred) {
  if (tokenGoogle && tokenGoogle.vence > Date.now() + 60_000) return tokenGoogle.valor
  const r = await fetch(URL_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: cred.clientId, client_secret: cred.clientSecret, refresh_token: cred.refreshToken }), signal: AbortSignal.timeout(20_000) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) throw new Error(`Google rechazó la credencial de Ads (${j.error_description || j.error || r.status})`)
  tokenGoogle = { valor: j.access_token, vence: Date.now() + (j.expires_in || 3600) * 1000 }
  return tokenGoogle.valor
}

async function gaql(query) {
  if (!process.env.AGENTES_GADS_CRED) throw new Error('Este cliente no tiene Google Ads conectado (ficha del cliente → Anuncios)')
  const cred = leerCredGoogleAds(process.env.AGENTES_GADS_CRED)
  const cid = cidValido(process.env.AGENTES_GADS_CID)
  const r = await fetch(`${URL_GADS}/customers/${cid}/googleAds:search`, {
    method: 'POST', signal: AbortSignal.timeout(60_000),
    headers: { Authorization: `Bearer ${await accesoGoogle(cred)}`, 'developer-token': cred.developerToken, 'Content-Type': 'application/json', ...(cred.loginCustomerId ? { 'login-customer-id': cred.loginCustomerId } : {}) },
    body: JSON.stringify({ query }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = j?.error || (Array.isArray(j) ? j[0]?.error : null) || {}
    throw new Error(`Google Ads respondió ${r.status}: ${String(e.message || 'error').slice(0, 300)}${r.status === 403 ? ' (¿el developer token está aprobado y la cuenta vinculada a tu MCC?)' : ''}`)
  }
  return j.results || []
}

async function insightsMeta(desde, hasta) {
  if (!process.env.AGENTES_META_TOKEN) throw new Error('Este cliente no tiene Meta Ads conectado (ficha del cliente → Anuncios)')
  const cuenta = cuentaMetaValida(process.env.AGENTES_META_CUENTA)
  const q = new URLSearchParams({ level: 'campaign', fields: camposInsightsMeta(), time_range: JSON.stringify({ since: desde, until: hasta }), limit: '200' })
  const r = await fetch(`${URL_META}/act_${cuenta}/insights?${q}`, { headers: { Authorization: `Bearer ${process.env.AGENTES_META_TOKEN}` }, signal: AbortSignal.timeout(60_000) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Meta respondió ${r.status}: ${String(j?.error?.message || 'error').slice(0, 300)}`)
  return j.data || []
}

const fechasSchema = { periodo: z.enum(PERIODOS).optional(), desde: z.string().optional(), hasta: z.string().optional() }
const tope = () => Number(process.env.AGENTES_ADS_TOPE) || 0

async function campanas(plataforma, r) {
  const out = [], errores = []
  if (plataforma !== 'meta') { try { out.push(...campanasGoogle(await gaql(gaqlCampanas(r.desde, r.hasta)))) } catch (e) { errores.push(`Google Ads: ${e.message}`) } }
  if (plataforma !== 'google') { try { out.push(...campanasMeta(await insightsMeta(r.desde, r.hasta))) } catch (e) { errores.push(`Meta: ${e.message}`) } }
  return { out, errores }
}

const server = new McpServer({ name: 'agentes-ads', version: '1.0.0' })

server.tool('estado_ads',
  'Qué plataformas de anuncios tiene conectadas este cliente (Google Ads, Meta) y su tope de gasto mensual. Úsala primero.',
  {},
  async () => ok({
    googleAds: process.env.AGENTES_GADS_CRED && process.env.AGENTES_GADS_CID ? `Conectado (cuenta ${process.env.AGENTES_GADS_CID})` : 'No conectado',
    meta: process.env.AGENTES_META_TOKEN && process.env.AGENTES_META_CUENTA ? `Conectado (act_${process.env.AGENTES_META_CUENTA})` : 'No conectado',
    topeMensual: tope() || 'sin tope cargado', soloLectura: 'Ninguna herramienta cambia campañas: tus cambios van como propuestas en el informe.',
  }))

server.tool('ads_auditoria',
  'Campañas de Google Ads y/o Meta del periodo con gasto, clics, conversiones, CPA y ROAS, más hallazgos y PROPUESTAS (gasto sin conversiones, CPA alto, CTR bajo, presupuesto limitado, términos a excluir, tope de gasto).',
  { ...fechasSchema, plataforma: z.enum(['google', 'meta', 'ambas']).default('ambas'), min_gasto: z.number().min(0).default(20) },
  async ({ periodo, desde, hasta, plataforma, min_gasto }) => {
    try {
      const hoy = hoyEn(ZONA)
      const r = resolverFechas({ periodo: periodo || 'ultimos_28', desde, hasta }, hoy)
      const { out, errores } = await campanas(plataforma, r)
      if (!out.length && errores.length) throw new Error(errores.join(' · '))
      let terminos = []
      if (plataforma !== 'meta' && process.env.AGENTES_GADS_CRED) { try { terminos = terminosGoogle(await gaql(gaqlTerminos(r.desde, r.hasta, 100))) } catch (e) { errores.push(`Términos: ${e.message}`) } }
      let gastoMes = 0
      if (tope()) { const mes = resolverFechas({ periodo: 'mes_actual' }, hoy); gastoMes = (await campanas(plataforma, mes)).out.reduce((s, c) => s + c.gasto, 0) }
      return ok({ periodo: r, ...auditar(out, { terminos, minGasto: min_gasto, topeMensual: tope(), gastoMes: Math.round(gastoMes * 100) / 100 }), avisos: errores })
    } catch (e) { return fail(e) }
  })

server.tool('ads_terminos_busqueda',
  'Google Ads: las búsquedas reales que activaron los anuncios, ordenadas por gasto (para proponer palabras negativas o nuevas).',
  { ...fechasSchema, limite: z.number().int().min(1).max(200).default(50) },
  async ({ periodo, desde, hasta, limite }) => {
    try {
      const r = resolverFechas({ periodo: periodo || 'ultimos_28', desde, hasta }, hoyEn(ZONA))
      return ok({ periodo: r, terminos: terminosGoogle(await gaql(gaqlTerminos(r.desde, r.hasta, limite))) })
    } catch (e) { return fail(e) }
  })

await server.connect(new StdioServerTransport())
