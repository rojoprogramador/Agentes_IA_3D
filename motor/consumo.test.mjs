import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumen, limitesDe, hastaCuandoBloqueado, ordenarCadena, podar, H5, SEMANA } from './consumo.mjs'

const ahora = new Date('2026-11-11T14:00:00').getTime()
const hace = (min) => ({ ts: ahora - min * 60_000, usd: 0.5, turnos: 3 })

test('límites por plan y propios', () => {
  assert.deepEqual(limitesDe('pro'), { tareas5h: 6, tareasSemana: 80 })
  assert.deepEqual(limitesDe('max', { tareas5h: 50 }), { tareas5h: 50, tareasSemana: 400 })
  assert.deepEqual(limitesDe('pro', { tareas5h: 0, tareasSemana: 'x' }), { tareas5h: 6, tareasSemana: 80 })
  assert.equal(limitesDe('api'), null)
  assert.deepEqual(limitesDe('desconocido'), limitesDe('pro'))
})

test('cuenta la ventana de 5 h y la semana, y satura al llegar al umbral', () => {
  const regs = [hace(10), hace(60), hace(299), hace(301), hace(60 * 24 * 3), hace(60 * 24 * 8)]
  const r = resumen(regs, ahora, { plan: 'pro', limites: { tareas5h: 4 } })
  assert.equal(r.usos5h, 3)
  assert.equal(r.usosSemana, 5)
  assert.equal(r.usd5h, 1.5)
  assert.equal(r.pct5h, 75)
  assert.equal(r.saturado, false)
  const r2 = resumen([...regs, hace(1)], ahora, { plan: 'pro', limites: { tareas5h: 4 } })
  assert.equal(r2.saturado, true)
  assert.match(r2.motivo, /5 h/)
  assert.equal(r2.liberaEn, ahora - 299 * 60_000 + H5)
})

test('umbral semanal y plan api sin umbral', () => {
  const regs = Array.from({ length: 10 }, (_, i) => hace(400 + i))
  assert.equal(resumen(regs, ahora, { plan: 'pro', limites: { tareasSemana: 10 } }).saturado, true)
  const api = resumen(regs, ahora, { plan: 'api' })
  assert.equal(api.saturado, false)
  assert.equal(api.usdSemana, 5)
})

test('bloqueo por mensaje de límite', () => {
  const r = resumen([], ahora, { plan: 'max', bloqueadoHasta: ahora + 1000 })
  assert.equal(r.saturado, true)
  assert.equal(resumen([], ahora, { plan: 'max', bloqueadoHasta: ahora - 1 }).saturado, false)
})

test('hora de reinicio del mensaje de Claude', () => {
  const epoch = Math.floor((ahora + 3600_000) / 1000)
  assert.equal(hastaCuandoBloqueado(`Claude AI usage limit reached|${epoch}`, ahora), epoch * 1000)
  const tres = new Date(ahora); tres.setHours(15, 0, 0, 0)
  assert.equal(hastaCuandoBloqueado('5-hour limit reached ∙ resets 3pm', ahora), tres.getTime())
  const manana = new Date(ahora); manana.setDate(manana.getDate() + 1); manana.setHours(9, 30, 0, 0)
  assert.equal(hastaCuandoBloqueado('limit reached, resets at 9:30 AM', ahora), manana.getTime())
  assert.equal(hastaCuandoBloqueado('usage limit', ahora, 60), ahora + 3600_000)
})

test('Claude pasa al final de la cadena solo si hay que cuidarlo', () => {
  assert.deepEqual(ordenarCadena(['claude', 'antigravity', 'codex'], true), ['antigravity', 'codex', 'claude'])
  assert.deepEqual(ordenarCadena(['claude', 'antigravity'], false), ['claude', 'antigravity'])
  assert.deepEqual(ordenarCadena(['codex'], true), ['codex'])
})

test('podar deja solo la última semana', () => {
  assert.equal(podar([hace(1), { ts: ahora - SEMANA - 1 }], ahora).length, 1)
})
