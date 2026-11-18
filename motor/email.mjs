// Email marketing (fase C2) con Listmonk (gratis, se instala en tu servidor). Funciones puras + cliente HTTP que usa
// email-server.mjs. Los agentes REDACTAN y dejan campañas en BORRADOR; ninguna herramienta envía: el envío lo da una
// persona en Listmonk. Cada cliente solo ve y usa sus listas (clients.email.listas).

export function autorizacionListmonk(cred) {
  const c = String(cred || '').trim()
  if (!/^[^:\s]+:\S+$/.test(c)) throw new Error('La credencial de Listmonk va como usuario_api:token')
  return `token ${c}`
}

export function urlListmonk(u) {
  const x = String(u || '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\/[^\s/]+(\/\S*)?$/.test(x)) throw new Error('La URL de Listmonk debe empezar por http:// o https://')
  return x
}

export const listasPermitidas = (ids) => [...new Set((Array.isArray(ids) ? ids : String(ids || '').split(/[\s,]+/)).map(Number).filter(n => Number.isInteger(n) && n > 0))]

// HTML de un correo: se quitan scripts, iframes y manejadores on* (los clientes de correo no los ejecutan y Listmonk
// tampoco debería guardarlos)
export function limpiarHtml(h) {
  return String(h || '').replace(/<(script|iframe|object|embed)[\s\S]*?<\/\1>/gi, '').replace(/<(script|iframe|object|embed)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/javascript:/gi, '')
}

export function cuerpoBorrador({ nombre, asunto, listas, html, permitidas, remitente = '' }) {
  const ids = listasPermitidas(listas)
  if (!ids.length) throw new Error('Elige al menos una lista')
  const fuera = ids.filter(i => !permitidas.includes(i))
  if (fuera.length) throw new Error(`Las listas ${fuera.join(', ')} no son de este cliente`)
  const a = String(asunto || '').trim(), n = String(nombre || '').trim()
  if (!a || a.length > 200) throw new Error('El asunto es obligatorio (máx. 200 caracteres)')
  if (!n || n.length > 200) throw new Error('El nombre interno es obligatorio')
  const cuerpo = limpiarHtml(html)
  if (cuerpo.length < 20) throw new Error('El contenido del correo está vacío')
  if (cuerpo.length > 300_000) throw new Error('El correo es demasiado largo')
  // type regular + content_type html; Listmonk crea las campañas en estado "draft" y no las envía hasta que alguien
  // pulsa "Iniciar" en su panel
  return { name: `[Borrador IA] ${n}`, subject: a, lists: ids, type: 'regular', content_type: 'html', body: cuerpo, ...(remitente ? { from_email: remitente } : {}), tags: ['agentes-ia'] }
}

export const resumenLista = (l) => ({ id: l.id, nombre: l.name, suscriptores: l.subscriber_count ?? l.subscribers ?? null, tipo: l.type, optin: l.optin })
export const resumenCampana = (c) => ({ id: c.id, nombre: c.name, asunto: c.subject, estado: c.status, listas: (c.lists || []).map(l => l.name || l.id), enviados: c.sent ?? null, creada: c.created_at })

export function crearListmonk({ url, credencial, fetchFn = fetch }) {
  const base = urlListmonk(url)
  const auth = autorizacionListmonk(credencial)
  async function pedir(ruta, opciones = {}) {
    const r = await fetchFn(`${base}/api${ruta}`, { ...opciones, headers: { Authorization: auth, 'Content-Type': 'application/json', ...(opciones.headers || {}) }, signal: AbortSignal.timeout(30_000) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`Listmonk respondió ${r.status}: ${String(j?.message || 'error').slice(0, 200)}`)
    return j.data
  }
  return {
    listas: async () => ((await pedir('/lists?per_page=all'))?.results || []).map(resumenLista),
    campanas: async () => ((await pedir('/campaigns?per_page=50&order_by=created_at&order=desc'))?.results || []).map(resumenCampana),
    crearBorrador: async (cuerpo) => resumenCampana(await pedir('/campaigns', { method: 'POST', body: JSON.stringify(cuerpo) })),
  }
}
