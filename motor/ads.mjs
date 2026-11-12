// Paid media (fase C1): Google Ads y Meta Ads en SOLO LECTURA. Funciones puras que usa ads-server.mjs y prueba
// ads.test.mjs. El agente audita y PROPONE; no hay ninguna herramienta que cambie campañas, presupuestos ni pujas.
// Cualquier cambio lo hace una persona en la plataforma (o, en el futuro, una herramienta que pase por B4).

export const VERSION_GOOGLE_ADS = 'v18'
export const VERSION_META = 'v21.0'

// ---------- Credenciales ----------
export function leerCredGoogleAds(texto) {
  let j
  try { j = typeof texto === 'string' ? JSON.parse(texto) : texto } catch { throw new Error('La credencial de Google Ads no es un JSON válido') }
  for (const k of ['developer_token', 'client_id', 'client_secret', 'refresh_token']) if (!j?.[k]) throw new Error(`Falta ${k} en la credencial de Google Ads`)
  return { developerToken: j.developer_token, clientId: j.client_id, clientSecret: j.client_secret, refreshToken: j.refresh_token, loginCustomerId: limpiarCid(j.login_customer_id || '') }
}
export const limpiarCid = (c) => String(c || '').replace(/-/g, '').trim()
export function cidValido(c) { const x = limpiarCid(c); if (!/^\d{10}$/.test(x)) throw new Error('El ID de cliente de Google Ads son 10 dígitos (123-456-7890)'); return x }
export function cuentaMetaValida(c) { const x = String(c || '').replace(/^act_/, '').trim(); if (!/^\d{5,20}$/.test(x)) throw new Error('La cuenta publicitaria de Meta son solo números (act_123…)'); return x }

// ---------- Google Ads (GAQL) ----------
const FECHA = /^\d{4}-\d{2}-\d{2}$/
function rango(desde, hasta) { if (!FECHA.test(desde) || !FECHA.test(hasta)) throw new Error('Fechas AAAA-MM-DD'); return `segments.date BETWEEN '${desde}' AND '${hasta}'` }
export const gaqlCampanas = (desde, hasta) => `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.search_budget_lost_impression_share FROM campaign WHERE ${rango(desde, hasta)} AND campaign.status != 'REMOVED'`
export const gaqlTerminos = (desde, hasta, limite = 50) => `SELECT search_term_view.search_term, campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM search_term_view WHERE ${rango(desde, hasta)} AND metrics.cost_micros > 0 ORDER BY metrics.cost_micros DESC LIMIT ${Math.min(Math.max(1, limite), 200)}`

const n = (x) => Number(x) || 0
const dinero = (micros) => Math.round(n(micros) / 10000) / 100
export function campanasGoogle(filas) {
  // Una fila por campaña y día no: con segments.date en WHERE (no en SELECT) Google agrega el periodo
  return (filas || []).map(r => ({
    plataforma: 'google', id: String(r.campaign?.id || ''), nombre: r.campaign?.name || '', estado: r.campaign?.status || '',
    canal: r.campaign?.advertisingChannelType || '', presupuestoDiario: dinero(r.campaignBudget?.amountMicros),
    gasto: dinero(r.metrics?.costMicros), impresiones: n(r.metrics?.impressions), clics: n(r.metrics?.clicks),
    conversiones: Math.round(n(r.metrics?.conversions) * 100) / 100, valor: Math.round(n(r.metrics?.conversionsValue) * 100) / 100,
    perdidaPorPresupuestoPct: r.metrics?.searchBudgetLostImpressionShare != null ? Math.round(n(r.metrics.searchBudgetLostImpressionShare) * 1000) / 10 : null,
  }))
}
export const terminosGoogle = (filas) => (filas || []).map(r => ({
  termino: r.searchTermView?.searchTerm || '', campana: r.campaign?.name || '', gasto: dinero(r.metrics?.costMicros),
  clics: n(r.metrics?.clicks), impresiones: n(r.metrics?.impressions), conversiones: n(r.metrics?.conversions),
}))

// ---------- Meta (Marketing API, insights) ----------
// Qué cuenta como conversión: leads, compras, contactos y conversaciones de mensajería (lo típico de un negocio local)
export const ACCIONES_CONVERSION = ['lead', 'purchase', 'contact', 'complete_registration', 'schedule', 'submit_application',
  'offsite_conversion.fb_pixel_lead', 'offsite_conversion.fb_pixel_purchase', 'onsite_conversion.messaging_conversation_started_7d', 'onsite_web_lead']
export function camposInsightsMeta() { return 'campaign_id,campaign_name,objective,spend,impressions,clicks,actions,action_values' }
export function campanasMeta(filas, acciones = ACCIONES_CONVERSION) {
  const suma = (lista) => (lista || []).filter(a => acciones.includes(a.action_type)).reduce((s, a) => s + n(a.value), 0)
  return (filas || []).map(r => ({
    plataforma: 'meta', id: String(r.campaign_id || ''), nombre: r.campaign_name || '', estado: '', canal: r.objective || '',
    presupuestoDiario: null, gasto: Math.round(n(r.spend) * 100) / 100, impresiones: n(r.impressions), clics: n(r.clicks),
    conversiones: suma(r.actions), valor: Math.round(suma(r.action_values) * 100) / 100, perdidaPorPresupuestoPct: null,
  }))
}

// ---------- Métricas y auditoría ----------
export function conMetricas(c) {
  return {
    ...c, ctrPct: c.impresiones ? Math.round((c.clics / c.impresiones) * 1000) / 10 : 0,
    cpc: c.clics ? Math.round((c.gasto / c.clics) * 100) / 100 : null,
    cpa: c.conversiones ? Math.round((c.gasto / c.conversiones) * 100) / 100 : null,
    roas: c.gasto && c.valor ? Math.round((c.valor / c.gasto) * 100) / 100 : null,
  }
}

export function totales(campanas) {
  const t = campanas.reduce((a, c) => ({ gasto: a.gasto + c.gasto, impresiones: a.impresiones + c.impresiones, clics: a.clics + c.clics, conversiones: a.conversiones + c.conversiones, valor: a.valor + c.valor }), { gasto: 0, impresiones: 0, clics: 0, conversiones: 0, valor: 0 })
  return conMetricas({ ...t, gasto: Math.round(t.gasto * 100) / 100, conversiones: Math.round(t.conversiones * 100) / 100, valor: Math.round(t.valor * 100) / 100 })
}

// Hallazgos y PROPUESTAS (ninguna se aplica sola). minGasto: por debajo no hay datos suficientes para opinar.
export function auditar(campanas, { terminos = [], minGasto = 20, topeMensual = 0, gastoMes = 0 } = {}) {
  const cs = campanas.map(conMetricas)
  const t = totales(cs)
  const out = []
  const add = (prioridad, campana, problema, evidencia, propuesta) => out.push({ prioridad, campana, problema, evidencia, propuesta })
  if (topeMensual > 0 && gastoMes > 0) {
    const pct = Math.round((gastoMes / topeMensual) * 100)
    if (pct >= 90) add('alta', '(cuenta)', `Gasto del mes al ${pct} % del tope del cliente`, `${gastoMes} de ${topeMensual}`, 'Revisar presupuestos diarios antes de que se pase del tope acordado')
  }
  for (const c of cs) {
    if (c.gasto < minGasto) continue
    if (c.conversiones === 0) add('alta', c.nombre, 'Gasta sin conversiones', `${c.gasto} gastados, ${c.clics} clics, 0 conversiones`, 'Revisar que la conversión esté bien medida; si lo está, pausar o reestructurar la campaña')
    else if (t.cpa && c.cpa > t.cpa * 1.5) add('media', c.nombre, 'Costo por conversión muy alto', `CPA ${c.cpa} vs ${t.cpa} de la cuenta`, 'Mover presupuesto hacia las campañas con mejor CPA y revisar segmentación')
    if (c.plataforma === 'google' && c.canal === 'SEARCH' && c.impresiones >= 500 && c.ctrPct < 2) add('media', c.nombre, 'CTR bajo en búsqueda', `CTR ${c.ctrPct} %`, 'Reescribir anuncios con la palabra clave en el título y revisar la concordancia de palabras clave')
    if (c.perdidaPorPresupuestoPct >= 20 && c.conversiones > 0 && (!t.cpa || c.cpa <= t.cpa)) add('media', c.nombre, 'Pierde impresiones por presupuesto y convierte bien', `${c.perdidaPorPresupuestoPct} % de impresiones perdidas por presupuesto, CPA ${c.cpa}`, 'Proponer al cliente subir el presupuesto diario de esta campaña')
  }
  const negativos = terminos.filter(x => x.conversiones === 0 && x.gasto >= Math.max(5, minGasto / 4)).slice(0, 15)
  if (negativos.length) add('media', '(términos de búsqueda)', `${negativos.length} búsquedas gastan sin convertir`, negativos.map(x => `"${x.termino}" (${x.gasto})`).join(', '), 'Agregarlas como palabras clave negativas si no tienen relación con el servicio')
  const orden = { alta: 0, media: 1, baja: 2 }
  return { totales: t, campanas: cs.sort((a, b) => b.gasto - a.gasto), hallazgos: out.sort((a, b) => orden[a.prioridad] - orden[b.prioridad]) }
}
