import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { herramientasPara, crearEjecutor, bucleHerramientas, htmlATexto, sinSoporteHerramientas } from './herramientas-api.mjs'

const nombres = (g) => herramientasPara(g).map(h => h.function.name)
const publicoDns = async () => [{ address: '93.184.216.34' }]
function carpeta() {
  const cwd = mkdtempSync(join(tmpdir(), 'api-'))
  mkdirSync(join(cwd, 'adjuntos'))
  writeFileSync(join(cwd, 'adjuntos', 'brief.md'), '# Brief\nCampaña de diciembre')
  writeFileSync(join(cwd, 'adjuntos', 'foto.jpg'), 'x')
  writeFileSync(join(cwd, 'secreto.env'), 'CLAVE=123')
  return cwd
}

test('herramientas según los grupos del agente', () => {
  assert.deepEqual(nombres(['web', 'archivos', 'skills']), ['leer_url', 'listar_adjuntos', 'leer_adjunto'])
  assert.deepEqual(nombres(['salida']), ['escribir_archivo'])
  assert.deepEqual(nombres(['skills', 'drive_lectura']), [])
  assert.equal(herramientasPara(['web'])[0].type, 'function')
})

test('adjuntos: lista y lee solo dentro de adjuntos/, solo texto', async () => {
  const cwd = carpeta()
  const ej = crearEjecutor({ cwd, permitidas: ['listar_adjuntos', 'leer_adjunto'], resolverDns: publicoDns })
  assert.match(await ej('listar_adjuntos', '{}'), /adjuntos\/brief\.md/)
  assert.match(await ej('leer_adjunto', '{"ruta":"adjuntos/brief.md"}'), /Campaña de diciembre/)
  assert.match(await ej('leer_adjunto', '{"ruta":"secreto.env"}'), /^Error: Solo se pueden leer archivos dentro de adjuntos/)
  assert.match(await ej('leer_adjunto', '{"ruta":"adjuntos/../secreto.env"}'), /^Error/)
  assert.match(await ej('leer_adjunto', '{"ruta":"adjuntos/foto.jpg"}'), /No puedo leer \.jpg/)
  assert.match(await ej('leer_adjunto', 'no json'), /JSON válido/)
  assert.match(await ej('escribir_archivo', '{"nombre":"a.html","contenido":"x"}'), /no está disponible/)
})

test('escribir_archivo: solo en salida/, nombres y extensiones seguros', async () => {
  const cwd = carpeta()
  const ej = crearEjecutor({ cwd, permitidas: ['escribir_archivo'], resolverDns: publicoDns })
  assert.match(await ej('escribir_archivo', JSON.stringify({ nombre: 'propuesta.html', contenido: '<h1>Hola</h1>' })), /PDF/)
  assert.equal(readFileSync(join(cwd, 'salida', 'propuesta.html'), 'utf8'), '<h1>Hola</h1>')
  for (const nombre of ['../fuera.html', '/etc/x.html', 'sub/dir.html', 'script.sh', 'x.exe', '.env'])
    assert.match(await ej('escribir_archivo', JSON.stringify({ nombre, contenido: 'x' })), /^Error/, nombre)
  assert.ok(!existsSync(join(cwd, 'fuera.html')))
})

test('leer_url: bloquea redes internas y redirecciones hacia adentro; convierte HTML', async () => {
  const cwd = carpeta()
  const html = '<html><head><title>Plomeros</title><script>alert(1)</script></head><body><h1>Servicios</h1><p>Destape &amp; fugas</p><a href="/c">Contacto</a></body></html>'
  const fetchFn = async (url) => url.includes('redirige')
    ? new Response(null, { status: 301, headers: { location: 'http://127.0.0.1/admin' } })
    : new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
  const dns = async (h) => (h === 'interno.ejemplo.com' ? [{ address: '10.0.0.5' }] : [{ address: '93.184.216.34' }])
  const ej = crearEjecutor({ cwd, permitidas: ['leer_url'], resolverDns: dns, fetchFn })
  const r = await ej('leer_url', '{"url":"https://ejemplo.com"}')
  assert.match(r, /Título: Plomeros/); assert.match(r, /## Servicios/); assert.match(r, /Destape & fugas/); assert.doesNotMatch(r, /alert/)
  assert.match(await ej('leer_url', '{"url":"http://localhost:3000"}'), /^Error/)
  assert.match(await ej('leer_url', '{"url":"https://interno.ejemplo.com"}'), /^Error: Solo se pueden leer sitios públicos/)
  assert.match(await ej('leer_url', '{"url":"https://ejemplo.com/redirige"}'), /^Error/)
})

test('bucle: ejecuta las herramientas pedidas y termina con la respuesta', async () => {
  const vistos = []
  let n = 0
  const llamar = async (conv, { sinHerramientas }) => {
    vistos.push(conv.length)
    n++
    if (n === 1) return { content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'listar_adjuntos', arguments: '{}' } }, { id: 'b', type: 'function', function: { name: 'leer_adjunto', arguments: '{"ruta":"adjuntos/brief.md"}' } }] }
    assert.equal(conv.at(-1).role, 'tool'); assert.equal(conv.at(-1).tool_call_id, 'b')
    return { content: 'Listo: tres ideas.' }
  }
  const ej = crearEjecutor({ cwd: carpeta(), permitidas: ['listar_adjuntos', 'leer_adjunto'], resolverDns: publicoDns })
  const r = await bucleHerramientas({ llamar, ejecutar: ej, mensajes: [{ role: 'user', content: 'hola' }], herramientas: herramientasPara(['archivos']) })
  assert.deepEqual(r, { texto: 'Listo: tres ideas.', pasos: 2, llamadas: 2 })
  assert.deepEqual(vistos, [1, 4])
})

test('bucle: al acabarse los pasos pide la respuesta final sin herramientas', async () => {
  let final = null
  const llamar = async (conv, { sinHerramientas }) => {
    if (sinHerramientas) { final = conv.at(-1).content; return { content: 'Final con lo que hay' } }
    return { content: null, tool_calls: [{ id: String(conv.length), function: { name: 'listar_adjuntos', arguments: '{}' } }] }
  }
  const ej = crearEjecutor({ cwd: carpeta(), permitidas: ['listar_adjuntos'], resolverDns: publicoDns })
  const r = await bucleHerramientas({ llamar, ejecutar: ej, mensajes: [], herramientas: herramientasPara(['archivos']), maxPasos: 3 })
  assert.equal(r.texto, 'Final con lo que hay'); assert.equal(r.llamadas, 3); assert.match(final, /Se acabaron los pasos/)
})

test('html a texto y detección de proveedor sin herramientas', () => {
  assert.equal(htmlATexto('<p>a&nbsp;b &#241; &iquest;c?</p>'), 'a b ñ ¿c?')
  assert.ok(sinSoporteHerramientas('tools is not supported for this model'))
  assert.ok(sinSoporteHerramientas('Function calling is not enabled'))
  assert.ok(!sinSoporteHerramientas('Rate limit exceeded'))
})
