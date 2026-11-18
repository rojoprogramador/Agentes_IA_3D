// Alertas de caída (fase C3): Uptime Kuma (monitor gratis de sitios) llama a un webhook del motor cuando un sitio
// cae o vuelve. El motor avisa por Telegram y crea UNA tarea al rol DevOps por incidente (diagnóstico → propuesta →
// tu aprobación). El agente no tiene acceso a servidores: solo mide desde afuera y propone.
// Funciones puras con pruebas en alertas.test.mjs.
import { timingSafeEqual } from 'node:crypto'

// Payload del webhook de Uptime Kuma: { heartbeat: { status 0=caído 1=arriba 2=pendiente 3=mantenimiento, msg, time }, monitor: {...}, msg }
export function leerAlertaKuma(body) {
  const hb = body?.heartbeat || {}, mon = body?.monitor || {}
  if (!mon.id && !mon.name) return null
  const estado = hb.status === 0 ? 'caido' : hb.status === 1 ? 'arriba' : 'otro'
  return {
    monitorId: String(mon.id ?? mon.name), nombre: String(mon.name || '').slice(0, 120), url: String(mon.url || (mon.hostname ? `https://${mon.hostname}` : '')).slice(0, 300),
    tipo: String(mon.type || ''), estado, mensaje: String(hb.msg || body?.msg || '').slice(0, 500), hora: String(hb.time || ''),
  }
}

// El token va en la ruta (/alertas/kuma/<token>) porque Kuma no firma sus webhooks; se compara en tiempo constante
export function tokenValido(recibido, esperado) {
  if (!esperado || !recibido) return false
  const a = Buffer.from(String(recibido)), b = Buffer.from(String(esperado))
  return a.length === b.length && timingSafeEqual(a, b)
}

const host = (u) => { try { return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' } }
// ¿De qué cliente es el monitor? Por el dominio de su web (ficha → Activos) o por el nombre del monitor
export function clienteDeAlerta(alerta, clientes) {
  const h = host(alerta.url)
  return clientes.find(c => h && host(c.activos?.web || '') === h)
    || clientes.find(c => c.nombre && alerta.nombre.toLowerCase().includes(String(c.nombre).toLowerCase())) || null
}

// abierta: { taskId, desde, caidas } del monitor, o null. tareaCerrada: la tarea de esa alerta ya terminó.
export function decidir(alerta, abierta, { tareaCerrada = false } = {}) {
  if (!alerta || alerta.estado === 'otro') return 'ignorar'
  if (alerta.estado === 'caido') return abierta && !tareaCerrada ? 'contar' : 'crear_tarea'
  return abierta ? 'resuelta' : 'ignorar'
}

export function briefIncidente(alerta, cliente) {
  return [
    `El monitor "${alerta.nombre}" reporta el sitio CAÍDO${alerta.hora ? ` desde ${alerta.hora}` : ''}.`,
    alerta.url ? `URL: ${alerta.url}` : '',
    alerta.mensaje ? `Mensaje del monitor: ${alerta.mensaje}` : '',
    cliente ? `Cliente: ${cliente.nombre}` : 'No se pudo asociar a un cliente (revisa el nombre del monitor o la web en la ficha).',
    '',
    'Haz el diagnóstico desde afuera con diagnostico_sitio (DNS, HTTP, tiempo de respuesta, certificado) y, si aplica, pagespeed.',
    'Entrega: 1) qué está fallando y la evidencia; 2) causa más probable; 3) pasos concretos para arreglarlo, quién los hace',
    '(hosting, DNS, desarrollador) y cuánto se tarda; 4) qué decirle al cliente. No tienes acceso a servidores: solo propones.',
  ].filter(x => x !== '').join('\n')
}
