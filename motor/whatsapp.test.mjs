import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { verificarFirma, respuestaVerificacion, extraerMensajes, partirTexto, ventanaAbierta, codigoEmparejamiento, normalizarNumero, aTextoWhatsApp, puedeResponderDesconocido, crearClienteWhatsApp } from './whatsapp.mjs'
import { urlDeSalida } from './tunel.mjs'

const firmar = (cuerpo, secreto) => 'sha256=' + createHmac('sha256', secreto).update(cuerpo).digest('hex')

test('firma de Meta: válida, alterada, sin secreto o mal formada', () => {
  const cuerpo = Buffer.from('{"entry":[]}')
  assert.ok(verificarFirma(cuerpo, firmar(cuerpo, 's3cr3t'), 's3cr3t'))
  assert.ok(!verificarFirma(Buffer.from('{"entry":[1]}'), firmar(cuerpo, 's3cr3t'), 's3cr3t'))
  assert.ok(!verificarFirma(cuerpo, firmar(cuerpo, 'otro'), 's3cr3t'))
  assert.ok(!verificarFirma(cuerpo, firmar(cuerpo, 's3cr3t'), ''))
  assert.ok(!verificarFirma(cuerpo, 'sha1=abc', 's3cr3t'))
  assert.ok(!verificarFirma(cuerpo, undefined, 's3cr3t'))
})

test('verificación del webhook (GET)', () => {
  const q = (o) => new URLSearchParams(o)
  assert.equal(respuestaVerificacion(q({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '12345' }), 'tok'), '12345')
  assert.equal(respuestaVerificacion(q({ 'hub.mode': 'subscribe', 'hub.verify_token': 'mal', 'hub.challenge': '1' }), 'tok'), null)
  assert.equal(respuestaVerificacion(q({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '<script>' }), 'tok'), null)
  assert.equal(respuestaVerificacion(q({ 'hub.mode': 'subscribe', 'hub.verify_token': '' }), ''), null)
})

test('mensajes del webhook: texto, voz, botones, otros tipos; ignora estados y otro número', () => {
  const body = { entry: [{ changes: [
    { field: 'messages', value: { metadata: { phone_number_id: '111' }, contacts: [{ wa_id: '573001112233', profile: { name: 'Ana' } }], messages: [
      { id: 'w1', from: '573001112233', timestamp: '1731400000', type: 'text', text: { body: 'Hola' } },
      { id: 'w2', from: '573001112233', timestamp: '1731400001', type: 'audio', audio: { id: 'm9', voice: true } },
      { id: 'w3', from: '573001112233', timestamp: '1731400002', type: 'image', image: { id: 'x' } },
      { id: 'w4', from: '573001112233', timestamp: '1731400003', type: 'interactive', interactive: { button_reply: { title: 'Sí' } } },
    ] } },
    { field: 'messages', value: { metadata: { phone_number_id: '111' }, statuses: [{ id: 'w1', status: 'read' }] } },
    { field: 'messages', value: { metadata: { phone_number_id: '999' }, messages: [{ id: 'z', from: '1', type: 'text', text: { body: 'otro número' } }] } },
  ] }] }
  const m = extraerMensajes(body, '111')
  assert.deepEqual(m.map(x => [x.id, x.tipo, x.texto ?? x.audioId]), [['w1', 'text', 'Hola'], ['w2', 'audio', 'm9'], ['w3', 'image', ''], ['w4', 'text', 'Sí']])
  assert.equal(m[0].nombre, 'Ana'); assert.equal(m[0].ts, 1731400000000)
  assert.deepEqual(extraerMensajes(null), [])
})

test('utilidades: número, ventana de 24 h, partir texto, formato, código, límite a desconocidos', () => {
  assert.equal(normalizarNumero('+57 300-111 2233'), '573001112233')
  const ahora = Date.now()
  assert.ok(ventanaAbierta(ahora - 23 * 3600e3, ahora)); assert.ok(!ventanaAbierta(ahora - 25 * 3600e3, ahora)); assert.ok(!ventanaAbierta(0, ahora))
  const partes = partirTexto('a'.repeat(3000) + '\n' + 'b'.repeat(3000))
  assert.equal(partes.length, 2); assert.ok(partes.every(p => p.length <= 4000))
  assert.deepEqual(partirTexto(''), partirTexto('   ')); assert.deepEqual(partirTexto(''), ['(sin respuesta)'])
  assert.equal(aTextoWhatsApp('## Título\n**negrita**'), 'Título\n*negrita*')
  assert.match(codigoEmparejamiento(), /^\d{6}$/)
  assert.ok(puedeResponderDesconocido(undefined)); assert.ok(!puedeResponderDesconocido(ahora - 60e3, ahora)); assert.ok(puedeResponderDesconocido(ahora - 2 * 3600e3, ahora))
})

test('cliente Graph: envía texto, explica la ventana de 24 h y descarga audio', async () => {
  const llamadas = []
  const fetchFn = async (url, o = {}) => {
    llamadas.push({ url, body: o.body && JSON.parse(o.body), auth: o.headers?.Authorization })
    if (url.endsWith('/messages') && JSON.parse(o.body).to === '570000000000') return new Response(JSON.stringify({ error: { code: 131047, message: 'Re-engagement message' } }), { status: 400 })
    if (url.endsWith('/messages')) return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }))
    if (url.endsWith('/m9')) return new Response(JSON.stringify({ url: 'https://lookaside.fbsbx.com/x', file_size: 10 }))
    return new Response(new Uint8Array([1, 2, 3]))
  }
  const c = crearClienteWhatsApp({ token: 'TK', phoneNumberId: '111', fetchFn, base: 'https://graph.test' })
  assert.deepEqual(await c.enviarTexto('+57 300 111 2233', '**Hola**'), ['wamid.1'])
  assert.equal(llamadas[0].url, 'https://graph.test/111/messages'); assert.equal(llamadas[0].auth, 'Bearer TK')
  assert.deepEqual(llamadas[0].body.text, { preview_url: false, body: '*Hola*' }); assert.equal(llamadas[0].body.to, '573001112233')
  await assert.rejects(c.enviarTexto('570000000000', 'x'), /24 h/)
  assert.deepEqual([...await c.descargarMedio('m9')], [1, 2, 3])
})

test('túnel: lee la URL del quick tunnel', () => {
  assert.equal(urlDeSalida('2026 INF |  https://rapid-fox-12.trycloudflare.com  |'), 'https://rapid-fox-12.trycloudflare.com')
  assert.equal(urlDeSalida('nada'), null)
})
