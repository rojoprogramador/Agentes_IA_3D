import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { tomarCandado, soltarCandado, esMotorVivo } from './candado.mjs'

const ruta = () => join(mkdtempSync(join(os.tmpdir(), 'candado-')), 'motor.lock')

test('candado: el primero lo toma; el segundo no arranca si el primero sigue vivo', () => {
  const r = ruta()
  assert.deepEqual(tomarCandado(r, { pid: 100, vivo: () => true }), { ok: true })
  assert.equal(readFileSync(r, 'utf8'), '100')
  assert.deepEqual(tomarCandado(r, { pid: 200, vivo: () => true }), { ok: false, pid: 100 })
})

test('candado: un dueño muerto o el propio PID (contenedor reiniciado) no bloquean', () => {
  const r = ruta()
  writeFileSync(r, '100')
  assert.deepEqual(tomarCandado(r, { pid: 200, vivo: () => false }), { ok: true })
  assert.equal(readFileSync(r, 'utf8'), '200')
  assert.deepEqual(tomarCandado(r, { pid: 200, vivo: () => true }), { ok: true }, 'mismo PID = candado viejo')
  writeFileSync(r, 'basura')
  assert.deepEqual(tomarCandado(r, { pid: 300, vivo: () => true }), { ok: true }, 'contenido ilegible = viejo')
})

test('candado: solo lo suelta quien lo tiene', () => {
  const r = ruta()
  tomarCandado(r, { pid: 100, vivo: () => true })
  soltarCandado(r, { pid: 999 })
  assert.ok(existsSync(r))
  soltarCandado(r, { pid: 100 })
  assert.ok(!existsSync(r))
  soltarCandado(r, { pid: 100 }) // sin candado: no falla
})

test('candado: este proceso de prueba existe pero no es un motor', () => {
  assert.equal(esMotorVivo(-1), false)
  assert.equal(esMotorVivo(2 ** 22 + 12345), false)
  if (existsSync('/proc/self')) assert.equal(esMotorVivo(process.pid), false)
})
