import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerAlertaKuma, tokenValido, clienteDeAlerta, decidir, briefIncidente } from './alertas.mjs'

const caido = { heartbeat: { status: 0, msg: 'Request failed with status code 502', time: '2026-11-12 22:10:00' }, monitor: { id: 4, name: 'Web Plomeros SAOR', url: 'https://www.plomerosyacabadoscali.com', type: 'http' }, msg: '[Web] Down' }

test('lee el webhook de Uptime Kuma', () => {
  const a = leerAlertaKuma(caido)
  assert.deepEqual([a.monitorId, a.estado, a.mensaje], ['4', 'caido', 'Request failed with status code 502'])
  assert.equal(leerAlertaKuma({ ...caido, heartbeat: { status: 1 } }).estado, 'arriba')
  assert.equal(leerAlertaKuma({ heartbeat: { status: 3 }, monitor: { id: 1 } }).estado, 'otro')
  assert.equal(leerAlertaKuma({ msg: 'prueba' }), null) // botón "Probar" de Kuma sin monitor
})

test('token en tiempo constante', () => {
  assert.ok(tokenValido('abc123', 'abc123')); assert.ok(!tokenValido('abc124', 'abc123')); assert.ok(!tokenValido('abc', 'abc123')); assert.ok(!tokenValido('x', ''))
})

test('asocia el monitor a un cliente por dominio o por nombre', () => {
  const clientes = [{ id: 'a', nombre: 'Otro', activos: { web: 'https://otro.com' } }, { id: 'b', nombre: 'SAOR', activos: { web: 'plomerosyacabadoscali.com' } }]
  assert.equal(clienteDeAlerta(leerAlertaKuma(caido), clientes).id, 'b')
  assert.equal(clienteDeAlerta({ url: '', nombre: 'API de Otro' }, clientes).id, 'a')
  assert.equal(clienteDeAlerta({ url: 'https://nadie.com', nombre: 'x' }, clientes), null)
})

test('una tarea por incidente', () => {
  const a = leerAlertaKuma(caido), arriba = leerAlertaKuma({ ...caido, heartbeat: { status: 1 } })
  assert.equal(decidir(a, null), 'crear_tarea')
  assert.equal(decidir(a, { taskId: 't1' }), 'contar')
  assert.equal(decidir(a, { taskId: 't1' }, { tareaCerrada: true }), 'crear_tarea')
  assert.equal(decidir(arriba, { taskId: 't1' }), 'resuelta')
  assert.equal(decidir(arriba, null), 'ignorar')
  assert.match(briefIncidente(a, { nombre: 'SAOR' }), /CAÍDO[\s\S]*502[\s\S]*Cliente: SAOR[\s\S]*diagnostico_sitio/)
})
