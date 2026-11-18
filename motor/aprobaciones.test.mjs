import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esSensible, separarHerramientas, decisionPrevia, resumenAccion, respuestaPermiso, botonesTelegram, parsearCallback, nombreAccion } from './aprobaciones.mjs'

const DRAFT = 'mcp__claude_ai_Gmail__create_draft'
const CREAR = 'mcp__claude_ai_Google_Drive__create_file'

test('sensibles: lista exacta y comodín; las de solo lectura quedan automáticas', () => {
  assert.ok(esSensible(DRAFT))
  assert.ok(esSensible('mcp__claude_ai_Gmail__send_message'))
  assert.ok(!esSensible('mcp__claude_ai_Gmail__get_thread'))
  assert.ok(!esSensible('mcp__magnific__account_balance'))
  const r = separarHerramientas(['Read', 'WebSearch', DRAFT, 'mcp__magnific__images_generate', 'mcp__magnific__simulate_cost'])
  assert.deepEqual(r.automaticas, ['Read', 'WebSearch', 'mcp__magnific__simulate_cost'])
  assert.deepEqual(r.sensibles, [DRAFT, 'mcp__magnific__images_generate'])
})

test('decisión previa: lo que no es de esta ejecución se deniega (Bash, Write fuera de salida)', () => {
  assert.equal(decisionPrevia({ tool: 'Bash', sensiblesDeEstaEjecucion: [DRAFT] }).decision, 'denegar')
  assert.equal(decisionPrevia({ tool: 'Write', sensiblesDeEstaEjecucion: [DRAFT], siempre: ['Write'] }).decision, 'denegar')
})

test('decisión previa: siempre, esta tarea, carpeta propia, programada y preguntar', () => {
  const base = { tool: DRAFT, sensiblesDeEstaEjecucion: [DRAFT, CREAR] }
  assert.equal(decisionPrevia(base).decision, 'preguntar')
  assert.equal(decisionPrevia({ ...base, siempre: [DRAFT] }).decision, 'permitir')
  assert.equal(decisionPrevia({ ...base, deEstaTarea: [DRAFT] }).decision, 'permitir')
  assert.equal(decisionPrevia({ ...base, programada: true }).decision, 'denegar')
  assert.equal(decisionPrevia({ ...base, programada: true, siempre: [DRAFT] }).decision, 'permitir')
  const drive = { ...base, tool: CREAR, carpetaDrive: 'CARPETA1' }
  assert.equal(decisionPrevia({ ...drive, input: { parentId: 'CARPETA1', title: 'x' } }).decision, 'permitir')
  assert.equal(decisionPrevia({ ...drive, input: { parentId: 'OTRA', title: 'x' } }).decision, 'preguntar')
  assert.equal(decisionPrevia({ ...drive, input: { title: 'x' } }).decision, 'preguntar')
})

test('resumen legible, recortado y sin claves', () => {
  const r = resumenAccion(DRAFT, { to: ['ana@ejemplo.com'], subject: 'Propuesta', body: 'Hola Ana, api_key=abc123 ' + 'x'.repeat(500) })
  assert.match(r, /Para: ana@ejemplo\.com/)
  assert.match(r, /Asunto: Propuesta/)
  assert.match(r, /\[oculto\]/)
  assert.doesNotMatch(r, /abc123/)
  assert.ok(r.length < 600)
  assert.equal(nombreAccion(DRAFT), 'Crear borrador en Gmail')
  assert.match(nombreAccion('mcp__magnific__images_generate'), /gasta créditos/)
})

test('respuesta para Claude Code y botones de Telegram', () => {
  assert.deepEqual(respuestaPermiso(true, { a: 1 }), { behavior: 'allow', updatedInput: { a: 1 } })
  assert.equal(respuestaPermiso(false, {}).behavior, 'deny')
  const b = botonesTelegram('abc123').flat()
  assert.equal(b.length, 4)
  for (const x of b) assert.ok(Buffer.byteLength(x.callback_data) <= 64)
  assert.deepEqual(parsearCallback(b[1].callback_data), { id: 'abc123', alcance: 'tarea' })
  assert.equal(parsearCallback('apr:../x:una'), null)
  assert.equal(parsearCallback('apr:abc:todo'), null)
})
