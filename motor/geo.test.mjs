import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configGeo, analizarRespuesta, resumenGeo, mensajesGeo, tocaGeo } from './geo.mjs'

const cfg = configGeo({ activo: true, marca: 'Plomeros y Acabados Cali', alias: 'SAOR', dominio: 'https://www.plomerosyacabadoscali.com/', competidores: 'Plomería Express\nFontaneros del Valle', prompts: 'a\nb', proveedores: ['p1', 'p2', 'p3', 'p4'] })

test('configuración: listas, dominio limpio y límites', () => {
  assert.equal(cfg.dominio, 'plomerosyacabadoscali.com'); assert.deepEqual(cfg.alias, ['SAOR']); assert.equal(cfg.proveedores.length, 3)
  assert.equal(configGeo({ prompts: Array(30).fill('x') }).prompts.length, 10)
})

test('detecta la marca por nombre, alias o dominio, sin tildes y por palabra completa', () => {
  const r = analizarRespuesta('Te recomiendo 1) Plomería Express, 2) PLOMEROS Y ACABADOS CALI, muy buenos con fugas.', cfg)
  assert.deepEqual([r.citada, r.lugar, r.competidores], [true, 2, ['Plomería Express']])
  assert.match(r.fragmento, /ACABADOS CALI/)
  assert.equal(analizarRespuesta('Visita plomerosyacabadoscali.com', cfg).citada, true)
  assert.equal(analizarRespuesta('Los SAORES de la región…', cfg).citada, false)
  assert.deepEqual(analizarRespuesta('Fontaneros del Valle es buena opción', cfg), { citada: false, lugar: null, competidores: ['Fontaneros del Valle'], fragmento: '' })
})

test('resumen: porcentaje por proveedor, lugar medio y competidores', () => {
  const r = resumenGeo([
    { proveedor: 'Gemini', citada: true, lugar: 1, competidores: ['A'] }, { proveedor: 'Gemini', citada: false, competidores: ['A', 'B'] },
    { proveedor: 'Groq', citada: true, lugar: 3, competidores: [] }, { proveedor: 'Groq', citada: true, lugar: 1, competidores: ['A'] },
  ])
  assert.equal(r.pct, 75)
  assert.deepEqual(r.proveedores.find(p => p.proveedor === 'Groq'), { proveedor: 'Groq', respuestas: 2, citada: 2, pct: 100, lugarMedio: 2 })
  assert.deepEqual(r.competidores[0], { nombre: 'A', veces: 3, pct: 75 })
})

test('la pregunta va sin contexto del cliente; semanal', () => {
  const m = mensajesGeo('¿Mejor plomero en Cali?')
  assert.equal(m.length, 2); assert.doesNotMatch(JSON.stringify(m), /Acabados/)
  assert.ok(tocaGeo(0)); assert.ok(!tocaGeo(Date.now() - 86400000)); assert.ok(tocaGeo(Date.now() - 8 * 86400000))
})
