import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abrirHistorial, consultaSegura, mensajesDeTarea, redactar, INTERNO } from './historial.mjs'

const nuevo = () => abrirHistorial(':memory:')

test('busca sin importar tildes ni mayúsculas', () => {
  const h = nuevo()
  h.registrar({ clienteId: 'A', tareaId: 't1', tarea: 'Campaña de verano', rol: 'entrega', texto: 'Propuesta de campaña para plomería en Cali' })
  const r = h.buscar({ clienteId: 'A', consulta: 'CAMPANA plomeria' })
  assert.equal(r.length, 1)
  assert.equal(r[0].tareaId, 't1')
  assert.match(r[0].fragmento, /«campaña»/)
})

test('un cliente nunca ve el historial de otro', () => {
  const h = nuevo()
  h.registrar({ clienteId: 'A', tareaId: 't1', rol: 'entrega', texto: 'Precios secretos del cliente A: plan oro' })
  h.registrar({ clienteId: 'B', tareaId: 't2', rol: 'entrega', texto: 'Otro texto del cliente B' })
  assert.equal(h.buscar({ clienteId: 'B', consulta: 'precios secretos plan oro' }).length, 0)
  assert.equal(h.buscar({ clienteId: INTERNO, consulta: 'precios secretos' }).length, 0)
  assert.equal(h.buscar({ clienteId: 'A', consulta: 'precios secretos' }).length, 1)
})

test('sin cliente no se puede buscar', () => {
  assert.throws(() => nuevo().buscar({ clienteId: '', consulta: 'algo' }), /cliente/)
})

test('las tareas sin cliente van al historial interno', () => {
  const h = nuevo()
  h.registrar({ clienteId: '', tareaId: 't1', rol: 'brief', texto: 'Plan interno de la agencia' })
  assert.equal(h.buscar({ clienteId: INTERNO, consulta: 'plan interno' }).length, 1)
})

test('registrar es idempotente (no duplica)', () => {
  const h = nuevo()
  const m = { clienteId: 'A', tareaId: 't1', rol: 'brief', texto: 'Mismo brief' }
  assert.equal(h.registrar(m), true)
  assert.equal(h.registrar(m), false)
  assert.equal(h.total(), 1)
})

test('excluye la tarea actual', () => {
  const h = nuevo()
  h.registrar({ clienteId: 'A', tareaId: 't1', rol: 'brief', texto: 'Logo nuevo' })
  h.registrar({ clienteId: 'A', tareaId: 't2', rol: 'brief', texto: 'Logo viejo' })
  const r = h.buscar({ clienteId: 'A', consulta: 'logo', excluirTarea: 't2' })
  assert.deepEqual(r.map(x => x.tareaId), ['t1'])
})

test('consulta segura: sin operadores de FTS5', () => {
  assert.equal(consultaSegura('logo" OR cliente_id:* NEAR('), '"logo" OR "or" OR "cliente" OR "id" OR "near"')
  assert.equal(consultaSegura('***'), '')
  // una consulta maliciosa no rompe la búsqueda ni salta el filtro
  const h = nuevo()
  h.registrar({ clienteId: 'A', tareaId: 't1', rol: 'brief', texto: 'dato de A' })
  assert.equal(h.buscar({ clienteId: 'B', consulta: '") OR 1=1 --' }).length, 0)
})

test('las claves no se guardan', () => {
  assert.match(redactar('usa la api_key: sk-abcdefghijklmnopqrstuvwx'), /\[clave omitida\]/)
  const h = nuevo()
  h.registrar({ clienteId: 'A', tareaId: 't1', rol: 'brief', texto: 'password: superSecreta123' })
  assert.equal(h.buscar({ clienteId: 'A', consulta: 'superSecreta123' }).length, 0)
})

test('mensajesDeTarea saca brief, versiones, correcciones y pregunta', () => {
  const m = mensajesDeTarea({ id: 't1', tarea: 'Post', descripcion: 'Para Instagram', versiones: [{ output: 'v1', fecha: '2026-01-01' }, { output: 'v2' }], feedback: 'Más corto', agentQuestion: '¿Qué color?' }, 'A')
  assert.deepEqual(m.map(x => x.rol), ['brief', 'entrega', 'entrega', 'correccion', 'pregunta'])
  assert.ok(m.every(x => x.clienteId === 'A' && x.tareaId === 't1'))
})
