// WhatsApp Business Cloud API (fase B9). Meta llama a un webhook público; como Firebase está en el plan Spark (sin
// Cloud Functions), el webhook lo atiende el MOTOR en 127.0.0.1 y un túnel de Cloudflare lo publica (tunel.mjs).
//
// Seguridad:
//  - Cada POST de Meta trae X-Hub-Signature-256 = HMAC-SHA256(app secret, cuerpo). Sin firma válida → 401.
//  - Números desconocidos reciben un código de emparejamiento; nadie habla con los agentes hasta que el dueño lo
//    aprueba en el panel (whatsappContactos). Rol "dueno": habla con el coordinador. Rol "cliente": su mensaje va a
//    la bandeja del panel y al historial de su cliente; la respuesta la escribe una persona (nada sale solo).
//  - WhatsApp solo deja escribir libremente dentro de las 24 h siguientes al último mensaje del contacto.
import { createHmac, timingSafeEqual, randomInt } from 'node:crypto'
import { createServer } from 'node:http'

export const VERSION_GRAPH = 'v21.0'
export const VENTANA_MS = 24 * 60 * 60 * 1000
const MAX_TEXTO = 4000 // WhatsApp admite 4096 caracteres por mensaje

// ---------- Webhook ----------
export function verificarFirma(cuerpo, cabecera, secreto) {
  if (!secreto || !cabecera || !/^sha256=[a-f0-9]{64}$/i.test(cabecera)) return false
  const esperado = Buffer.from('sha256=' + createHmac('sha256', secreto).update(cuerpo).digest('hex'))
  const recibido = Buffer.from(cabecera.toLowerCase())
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido)
}

// GET de verificación cuando se configura el webhook en Meta: devuelve el challenge o null
export function respuestaVerificacion(query, tokenVerificacion) {
  if (!tokenVerificacion) return null
  if (query.get('hub.mode') !== 'subscribe' || query.get('hub.verify_token') !== tokenVerificacion) return null
  const c = query.get('hub.challenge') || ''
  return /^[\w-]{1,200}$/.test(c) ? c : null
}

// Mensajes entrantes del cuerpo del webhook (se ignoran estados de entrega y lo que no sea de este número)
export function extraerMensajes(body, phoneNumberId = '') {
  const out = []
  for (const e of body?.entry || []) for (const ch of e.changes || []) {
    const v = ch.value || {}
    if (ch.field !== 'messages' || !Array.isArray(v.messages)) continue
    if (phoneNumberId && v.metadata?.phone_number_id && v.metadata.phone_number_id !== phoneNumberId) continue
    const nombres = Object.fromEntries((v.contacts || []).map(c => [c.wa_id, c.profile?.name || '']))
    for (const m of v.messages) {
      const base = { id: m.id, de: normalizarNumero(m.from), nombre: String(nombres[m.from] || '').slice(0, 80), ts: Number(m.timestamp) * 1000 || Date.now(), tipo: m.type }
      if (m.type === 'text') out.push({ ...base, texto: String(m.text?.body || '').slice(0, 8000) })
      else if (m.type === 'audio') out.push({ ...base, audioId: m.audio?.id, voz: !!m.audio?.voice })
      else if (m.type === 'button') out.push({ ...base, tipo: 'text', texto: String(m.button?.text || '') })
      else if (m.type === 'interactive') out.push({ ...base, tipo: 'text', texto: String(m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '') })
      else out.push({ ...base, texto: '' }) // imagen, documento, ubicación…: se avisa que solo se lee texto y voz
    }
  }
  return out
}

// ---------- Utilidades ----------
export const normalizarNumero = (n) => String(n || '').replace(/[^\d]/g, '').slice(0, 15)
export const ventanaAbierta = (ultimoEntranteMs, ahora = Date.now()) => !!ultimoEntranteMs && ahora - ultimoEntranteMs < VENTANA_MS
export const codigoEmparejamiento = () => String(randomInt(100000, 1000000))

export function partirTexto(t, max = MAX_TEXTO) {
  const s = String(t || '').trim() || '(sin respuesta)'
  const partes = []
  let resto = s
  while (resto.length > max) {
    let corte = resto.lastIndexOf('\n', max)
    if (corte < max * 0.5) corte = resto.lastIndexOf(' ', max)
    if (corte < max * 0.5) corte = max
    partes.push(resto.slice(0, corte).trim())
    resto = resto.slice(corte).trim()
  }
  if (resto) partes.push(resto)
  return partes
}

// WhatsApp no muestra Markdown completo: ** → *, quita encabezados y tablas
export const aTextoWhatsApp = (t) => String(t || '').replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/^#{1,6}\s+/gm, '').replace(/^\|.*\|$/gm, l => l.replace(/\|/g, ' ').trim())

// Límite de respuestas a desconocidos (no gastar ni dar pie a abuso): una cada hora por número
export function puedeResponderDesconocido(ultimoAviso, ahora = Date.now()) {
  return !ultimoAviso || ahora - ultimoAviso > 60 * 60 * 1000
}

// ---------- Cliente de la Graph API ----------
export function crearClienteWhatsApp({ token, phoneNumberId, fetchFn = fetch, base = `https://graph.facebook.com/${VERSION_GRAPH}` }) {
  const cab = { Authorization: `Bearer ${token}` }
  async function enviarTexto(para, texto) {
    const ids = []
    for (const parte of partirTexto(aTextoWhatsApp(texto))) {
      const r = await fetchFn(`${base}/${phoneNumberId}/messages`, {
        method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: normalizarNumero(para), type: 'text', text: { preview_url: false, body: parte } }),
        signal: AbortSignal.timeout(20_000),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        const e = j?.error || {}
        // 131047: pasaron más de 24 h desde el último mensaje del contacto (solo plantillas aprobadas)
        throw new Error(e.code === 131047 ? 'Pasaron más de 24 h desde su último mensaje: WhatsApp solo deja enviar plantillas aprobadas' : `WhatsApp respondió ${r.status}: ${e.message || 'error'}`)
      }
      ids.push(j.messages?.[0]?.id || '')
    }
    return ids
  }
  async function marcarLeido(mensajeId) {
    await fetchFn(`${base}/${phoneNumberId}/messages`, {
      method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: mensajeId }), signal: AbortSignal.timeout(10_000),
    }).catch(() => {})
  }
  // Nota de voz: primero se pide la URL temporal del archivo y luego se descarga con el mismo token
  async function descargarMedio(id) {
    const r = await fetchFn(`${base}/${id}`, { headers: cab, signal: AbortSignal.timeout(20_000) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.url) throw new Error('No pude obtener el audio')
    if ((j.file_size || 0) > 16 * 1024 * 1024) throw new Error('Audio demasiado grande')
    const a = await fetchFn(j.url, { headers: cab, signal: AbortSignal.timeout(60_000) })
    if (!a.ok) throw new Error('No pude descargar el audio')
    return new Uint8Array(await a.arrayBuffer())
  }
  return { enviarTexto, marcarLeido, descargarMedio }
}

// ---------- Servidor del webhook (solo 127.0.0.1; el túnel lo publica) ----------
// tokenVerificacion y appSecret son funciones para leer siempre el valor vigente del panel.
// Desde C3 el mismo servidor atiende también /alertas/... (otrasRutas(ruta, cuerpo) → código HTTP); con
// whatsappActivo false, /whatsapp responde 404.
export function crearServidorWebhook({ tokenVerificacion, appSecret, phoneNumberId = '', alMensaje, log = () => {}, whatsappActivo = true, otrasRutas = null }) {
  return createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost')
    if (otrasRutas && u.pathname.startsWith('/alertas/') && req.method === 'POST') {
      const partes = []; let n = 0
      req.on('data', d => { n += d.length; if (n > 200_000) req.destroy(); else partes.push(d) })
      req.on('end', () => {
        Promise.resolve().then(() => otrasRutas(u.pathname, Buffer.concat(partes))).then(c => { res.writeHead(c || 200); res.end() }, () => { res.writeHead(500); res.end() })
      })
      return
    }
    if (u.pathname !== '/whatsapp' || !whatsappActivo) { res.writeHead(404); res.end(); return }
    if (req.method === 'GET') { // verificación al configurar el webhook en Meta
      const c = respuestaVerificacion(u.searchParams, tokenVerificacion())
      res.writeHead(c ? 200 : 403, { 'Content-Type': 'text/plain' }); res.end(c || 'no')
      if (c) log('WhatsApp: Meta verificó el webhook ✔')
      return
    }
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
    const partes = []; let n = 0
    req.on('data', d => { n += d.length; if (n > 1_000_000) req.destroy(); else partes.push(d) })
    req.on('end', () => {
      const cuerpo = Buffer.concat(partes)
      if (!verificarFirma(cuerpo, req.headers['x-hub-signature-256'], appSecret())) {
        res.writeHead(401); res.end(); log('WhatsApp: llegó una petición sin firma válida (ignorada)'); return
      }
      res.writeHead(200); res.end('ok') // Meta exige responder rápido; el mensaje se procesa después
      let body = null
      try { body = JSON.parse(cuerpo.toString('utf8')) } catch { return }
      for (const m of extraerMensajes(body, phoneNumberId)) Promise.resolve().then(() => alMensaje(m)).catch(e => log('WhatsApp: error atendiendo un mensaje:', e.message))
    })
  })
}
