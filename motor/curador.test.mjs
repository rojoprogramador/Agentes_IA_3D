import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { skillsUsadas, planCuracion, tocaPasada, pasada, listarArchivo, restaurar, leerEstado, sumarUsos } from './curador.mjs'

const DIA = 86400000
const ev = (content) => JSON.stringify({ type: 'assistant', message: { content } })

test('cuenta Skill y lecturas de SKILL.md en el stream-json', () => {
  const raw = [
    ev([{ type: 'tool_use', name: 'Skill', input: { skill: 'pdf' } }]),
    ev([{ type: 'tool_use', name: 'Skill', input: { skill: 'plugin:copywriting' } }, { type: 'text', text: 'hola' }]),
    ev([{ type: 'tool_use', name: 'Read', input: { file_path: '/x/trabajos/t1/.claude/skills/pdf/SKILL.md' } }]),
    ev([{ type: 'tool_use', name: 'Read', input: { file_path: '/x/notas.md' } }]),
    ev([{ type: 'tool_use', name: 'Skill', input: { skill: '../../etc' } }]),
    'basura no json tool_use',
    JSON.stringify({ type: 'result', result: 'ok', num_turns: 3 }),
  ].join('\n')
  assert.deepEqual(Object.fromEntries(skillsUsadas(raw)), { pdf: 2, copywriting: 1 })
})

test('plan: inactiva a los 14 días, archiva a los 30, respeta protegidas y reactiva', () => {
  const ahora = Date.parse('2026-12-31T00:00:00Z')
  const hace = (d) => new Date(ahora - d * DIA).toISOString()
  const skills = ['nueva', 'vieja', 'media', 'fijada', 'volvio'].map(n => ({ clave: n, nombre: n, alcance: 'global' }))
  const estado = { skills: {
    vieja: { usos: 3, ultimoUso: hace(40), vistaDesde: hace(60) },
    media: { usos: 0, vistaDesde: hace(20) },
    fijada: { usos: 0, vistaDesde: hace(90) },
    volvio: { usos: 5, ultimoUso: hace(1), vistaDesde: hace(90), estado: 'inactiva' },
  } }
  const { acciones, estado: e2 } = planCuracion({ skills, estado, protegidas: new Set(['fijada']), ahora })
  const por = Object.fromEntries(acciones.map(a => [a.clave, a.accion]))
  assert.deepEqual(por, { vieja: 'archivar', media: 'inactivar', volvio: 'reactivar' })
  assert.ok(e2.skills.nueva.vistaDesde, 'la skill nueva empieza su reloj hoy')
})

test('una skill instalada hace poco no se archiva aunque el curador la viera hace tiempo', () => {
  const ahora = Date.parse('2026-12-31T00:00:00Z')
  const { acciones } = planCuracion({
    skills: [{ clave: 'x', nombre: 'x', alcance: 'global' }],
    estado: { skills: { x: { usos: 0, vistaDesde: new Date(ahora - 50 * DIA).toISOString() } } },
    instaladas: { x: new Date(ahora - 2 * DIA).toISOString() }, ahora,
  })
  assert.equal(acciones.length, 0)
})

test('toca pasada: semanal y con el motor libre 2 h', () => {
  const ahora = Date.now()
  assert.equal(tocaPasada({ ultimaPasada: '', ultimaActividad: ahora - 3 * 3600e3, ocupado: false, ahora }), true)
  assert.equal(tocaPasada({ ultimaPasada: '', ultimaActividad: ahora - 3600e3, ocupado: false, ahora }), false)
  assert.equal(tocaPasada({ ultimaPasada: '', ultimaActividad: 0, ocupado: true, ahora }), false)
  assert.equal(tocaPasada({ ultimaPasada: new Date(ahora - 2 * DIA).toISOString(), ultimaActividad: 0, ocupado: false, ahora }), false)
})

function montar() {
  const ROOT = mkdtempSync(join(tmpdir(), 'curador-'))
  for (const [dir, n] of [['.claude/skills', 'vieja'], ['.claude/skills', 'usada'], ['skills-clientes/cli1', 'vieja']]) {
    mkdirSync(join(ROOT, dir, n), { recursive: true })
    writeFileSync(join(ROOT, dir, n, 'SKILL.md'), `---\nname: ${n}\n---\n`)
  }
  const rutaEstado = join(ROOT, 'logs', 'skills-uso.json')
  const ahora = Date.now()
  const viejo = new Date(ahora - 45 * DIA).toISOString()
  mkdirSync(join(ROOT, 'logs'))
  writeFileSync(rutaEstado, JSON.stringify({ skills: { vieja: { usos: 0, vistaDesde: viejo }, 'cli1/vieja': { usos: 0, vistaDesde: viejo }, usada: { usos: 1, vistaDesde: viejo, ultimoUso: new Date(ahora).toISOString() } } }))
  return { ROOT, rutaEstado, carpetaRespaldos: join(ROOT, 'logs', 'respaldos'), ahora }
}

test('simular no mueve nada', () => {
  const m = montar()
  const r = pasada({ ...m, simular: true })
  assert.equal(r.acciones.filter(a => a.accion === 'archivar').length, 2)
  assert.ok(existsSync(join(m.ROOT, '.claude/skills/vieja/SKILL.md')))
  assert.ok(!existsSync(m.carpetaRespaldos))
  assert.match(r.texto, /Se archivarían \(2\)/)
})

test('pasada real: respaldo, archiva (sin borrar), separa clientes y restaura', () => {
  const m = montar()
  const r = pasada({ ...m, simular: false })
  assert.ok(r.respaldo && existsSync(r.respaldo))
  assert.ok(!existsSync(join(m.ROOT, '.claude/skills/vieja')))
  assert.ok(existsSync(join(m.ROOT, '.claude/skills/usada/SKILL.md')))
  assert.ok(existsSync(join(m.ROOT, 'skills-archivo/_global/vieja/SKILL.md')))
  assert.ok(existsSync(join(m.ROOT, 'skills-archivo/cli1/vieja/SKILL.md')))
  const arch = listarArchivo(m.ROOT)
  assert.equal(arch.length, 2)
  const res = restaurar(m.ROOT, 'cli1/vieja')
  assert.ok(existsSync(join(m.ROOT, 'skills-clientes/cli1/vieja/SKILL.md')))
  assert.equal(res.alcance, 'cliente')
  assert.ok(!existsSync(join(m.ROOT, 'skills-clientes/cli1/vieja/.archivada.json')))
  assert.throws(() => restaurar(m.ROOT, '../../etc'))
  assert.throws(() => restaurar(m.ROOT, '_global/../x'))
})

test('sumarUsos acumula y fija la fecha', () => {
  const e = sumarUsos({ skills: {} }, new Map([['pdf', 2]]), '2026-11-12T00:00:00.000Z')
  sumarUsos(e, new Map([['pdf', 1]]), '2026-11-13T00:00:00.000Z')
  assert.deepEqual(e.skills.pdf, { usos: 3, vistaDesde: '2026-11-12T00:00:00.000Z', ultimoUso: '2026-11-13T00:00:00.000Z' })
  assert.deepEqual(leerEstado('/no/existe.json'), { skills: {} })
})
