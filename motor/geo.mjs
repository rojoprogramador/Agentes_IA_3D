// GEO, "Generative Engine Optimization" (fase C4): ¿las IA recomiendan a la marca del cliente? Cada semana el motor
// hace las mismas preguntas (prompts) a 2 o 3 modelos por API y registra si la citan, en qué orden y qué competidores
// nombran. Funciones puras con pruebas en geo.test.mjs.

export const MAX_PROMPTS = 10
export const MAX_PROVEEDORES = 3
const DIA = 86400000

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Coincidencia por palabra completa (sin tildes ni mayúsculas): "SAOR" no coincide dentro de "SAORES"
function posicion(texto, nombre) {
  const n = norm(nombre)
  if (n.length < 2) return -1
  const m = new RegExp(`(^|[^a-z0-9])${escapar(n)}([^a-z0-9]|$)`).exec(texto)
  return m ? m.index + m[1].length : -1
}

export function configGeo(g) {
  const lista = (x) => (Array.isArray(x) ? x : String(x || '').split('\n')).map(s => String(s).trim()).filter(Boolean)
  return {
    activo: g?.activo === true, marca: String(g?.marca || '').trim(), alias: lista(g?.alias).slice(0, 10), dominio: String(g?.dominio || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''),
    competidores: lista(g?.competidores).slice(0, 15), prompts: lista(g?.prompts).slice(0, MAX_PROMPTS), proveedores: lista(g?.proveedores).slice(0, MAX_PROVEEDORES),
  }
}

// Analiza UNA respuesta: ¿cita la marca (o su dominio)? ¿en qué lugar entre las marcas nombradas? ¿qué competidores?
export function analizarRespuesta(texto, cfg) {
  const t = norm(texto)
  const nombres = [cfg.marca, ...cfg.alias, cfg.dominio].filter(Boolean)
  const posMarca = Math.min(...nombres.map(n => posicion(t, n)).filter(p => p >= 0), Infinity)
  const comps = cfg.competidores.map(c => ({ nombre: c, pos: posicion(t, c) })).filter(c => c.pos >= 0).sort((a, b) => a.pos - b.pos)
  const citada = posMarca !== Infinity
  const lugar = citada ? 1 + comps.filter(c => c.pos < posMarca).length : null
  let fragmento = ''
  if (citada) { const crudo = String(texto); const i = norm(crudo).indexOf(t.slice(posMarca, posMarca + 10)); fragmento = crudo.slice(Math.max(0, i - 120), i + 180).replace(/\s+/g, ' ').trim() }
  return { citada, lugar, competidores: comps.map(c => c.nombre), fragmento }
}

// Resumen para el panel: % de respuestas que citan la marca, por proveedor y total, y competidores más nombrados
export function resumenGeo(resultados) {
  const porProv = {}
  const comps = {}
  for (const r of resultados) {
    const p = porProv[r.proveedor] || (porProv[r.proveedor] = { respuestas: 0, citada: 0, lugares: [] })
    p.respuestas++
    if (r.citada) { p.citada++; if (r.lugar) p.lugares.push(r.lugar) }
    for (const c of r.competidores || []) comps[c] = (comps[c] || 0) + 1
  }
  const total = resultados.length, citadas = resultados.filter(r => r.citada).length
  return {
    total, citadas, pct: total ? Math.round((citadas / total) * 100) : 0,
    proveedores: Object.entries(porProv).map(([proveedor, p]) => ({ proveedor, ...p, pct: Math.round((p.citada / p.respuestas) * 100), lugarMedio: p.lugares.length ? Math.round((p.lugares.reduce((s, x) => s + x, 0) / p.lugares.length) * 10) / 10 : null })).map(({ lugares, ...x }) => x),
    competidores: Object.entries(comps).sort((a, b) => b[1] - a[1]).map(([nombre, veces]) => ({ nombre, veces, pct: total ? Math.round((veces / total) * 100) : 0 })),
  }
}

// La pregunta va SOLA, como la haría cualquier persona: sin contexto del cliente (no se le "sopla" la respuesta)
export const mensajesGeo = (prompt) => [
  { role: 'system', content: 'Responde en español como le responderías a cualquier persona que te hace esta pregunta. Si recomiendas negocios o marcas concretas, nómbralos.' },
  { role: 'user', content: String(prompt) },
]

export const tocaGeo = (ultima, ahora = Date.now(), cadaDias = 7) => !ultima || ahora - ultima >= cadaDias * DIA
