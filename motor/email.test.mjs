import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autorizacionListmonk, urlListmonk, listasPermitidas, limpiarHtml, cuerpoBorrador, crearListmonk } from './email.mjs'

test('credencial, URL y listas', () => {
  assert.equal(autorizacionListmonk('api_agencia:abc123'), 'token api_agencia:abc123')
  assert.throws(() => autorizacionListmonk('sin-dos-puntos'))
  assert.equal(urlListmonk('https://mail.ejemplo.com/'), 'https://mail.ejemplo.com')
  assert.throws(() => urlListmonk('ftp://x'))
  assert.deepEqual(listasPermitidas('3, 5 5 x 0'), [3, 5])
})

test('HTML del correo sin scripts ni manejadores', () => {
  const h = limpiarHtml('<p onclick="x()">Hola</p><script>robar()</script><a href="javascript:alert(1)">x</a><iframe src="y"></iframe>')
  assert.doesNotMatch(h, /script|onclick|javascript:|iframe/i); assert.match(h, /<p>Hola<\/p>/)
})

test('borrador: solo listas del cliente, campos obligatorios', () => {
  const ok = cuerpoBorrador({ nombre: 'Bienvenida 1', asunto: 'Hola', listas: [3], html: '<p>Contenido del correo</p>', permitidas: [3, 5] })
  assert.equal(ok.name, '[Borrador IA] Bienvenida 1'); assert.deepEqual(ok.lists, [3]); assert.equal(ok.type, 'regular')
  assert.ok(!('send_at' in ok) && !('status' in ok))
  assert.throws(() => cuerpoBorrador({ nombre: 'x', asunto: 'y', listas: [9], html: '<p>contenido largo</p>', permitidas: [3] }), /no son de este cliente/)
  assert.throws(() => cuerpoBorrador({ nombre: 'x', asunto: '', listas: [3], html: '<p>contenido largo</p>', permitidas: [3] }), /asunto/)
})

test('cliente de Listmonk: autoriza, filtra y crea borradores', async () => {
  const vistos = []
  const fetchFn = async (url, o) => {
    vistos.push([o.method || 'GET', url, o.headers.Authorization])
    if (url.endsWith('/api/campaigns') && o.method === 'POST') return new Response(JSON.stringify({ data: { id: 7, name: JSON.parse(o.body).name, subject: 'Hola', status: 'draft', lists: [{ id: 3, name: 'Clientes SAOR' }] } }))
    return new Response(JSON.stringify({ data: { results: [{ id: 3, name: 'Clientes SAOR', subscriber_count: 120, type: 'private', optin: 'double' }] } }))
  }
  const lm = crearListmonk({ url: 'https://mail.e.com', credencial: 'u:t', fetchFn })
  assert.deepEqual(await lm.listas(), [{ id: 3, nombre: 'Clientes SAOR', suscriptores: 120, tipo: 'private', optin: 'double' }])
  const c = await lm.crearBorrador({ name: 'x' })
  assert.equal(c.estado, 'draft')
  assert.deepEqual(vistos[1], ['POST', 'https://mail.e.com/api/campaigns', 'token u:t'])
  assert.ok(!vistos.some(v => /start|status|send/.test(v[1])), 'nunca toca el endpoint de envío')
})
