// Memoria con límite (funciones puras; las usan el motor y el panel; pruebas en memoria.test.mjs).
// Como en Hermes Agent: la memoria es corta a propósito. Si una entrada nueva no cabe, no se recorta sola:
// hay que consolidar (editar o quitar entradas) para que solo quede lo importante.
//   - Memoria del agente  (agents.aprendizajes)  2.200 caracteres: lecciones que aplica con todos los clientes
//   - Memoria del cliente (clients.aprendizajes) 2.200 caracteres: lo aprendido con ese cliente
//   - Perfil del dueño    (config/perfilDueno)   1.375 caracteres: preferencias de quien aprueba
// Cada entrada: { texto, origenTaskId?, fecha? }. Se inyecta como bloque fijo al inicio de cada tarea.

export const LIMITES_MEMORIA = { agente: 2200, cliente: 2200, dueno: 1375 }
export const SEPARADOR = ' § '

const textos = (entradas) => (Array.isArray(entradas) ? entradas : []).map(e => String(e?.texto ?? e ?? '').trim()).filter(Boolean)
export const usoMemoria = (entradas) => {
  const t = textos(entradas)
  return t.reduce((n, x) => n + x.length, 0) + Math.max(0, t.length - 1) * SEPARADOR.length
}

// Rechaza lo que no debe entrar nunca a la memoria (se repite en cada tarea, así que sería permanente)
export const CREDENCIAL = /(sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(contrase(ñ|n)a|password|passwd|token|api[_ -]?key|secret)\s*[:=]\s*\S{6,})/i
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿­]/
const INYECCION = /(ignora(r)?\s+(todas\s+)?(las\s+)?instrucciones|ignore\s+(all\s+)?(previous|prior|above)\s+instructions|olvida\s+(tus|las)\s+(reglas|instrucciones)|system\s+prompt|eres\s+ahora\s+un|you\s+are\s+now\s+a|desactiva\s+(las\s+)?reglas|developer\s+mode)/i
const EXFILTRA = /https?:\/\/\S+[?&](token|key|secret|password|pass|auth)=/i

export function revisarEntrada(texto) {
  const t = String(texto || '').trim()
  if (!t) return 'La entrada está vacía'
  if (INVISIBLE.test(t)) return 'Tiene caracteres invisibles'
  if (CREDENCIAL.test(t)) return 'Parece una contraseña, clave o token: nunca va en la memoria'
  if (EXFILTRA.test(t)) return 'Tiene un enlace que envía claves o tokens'
  if (INYECCION.test(t)) return 'Parece una instrucción para que el agente ignore sus reglas'
  return ''
}

// Agrega una entrada si cabe. Devuelve { ok, entradas, error, uso, limite }
export function agregarEntrada(entradas, nueva, limite) {
  const lista = Array.isArray(entradas) ? entradas : []
  const e = typeof nueva === 'string' ? { texto: nueva } : { ...nueva }
  e.texto = String(e.texto || '').trim()
  const error = revisarEntrada(e.texto)
  if (error) return { ok: false, entradas: lista, error, uso: usoMemoria(lista), limite }
  if (textos(lista).includes(e.texto)) return { ok: true, entradas: lista, error: '', uso: usoMemoria(lista), limite }
  const nuevas = [...lista, e]
  const uso = usoMemoria(nuevas)
  if (uso > limite) {
    return { ok: false, entradas: lista, uso: usoMemoria(lista), limite,
      error: `No cabe: la memoria quedaría en ${uso}/${limite} caracteres. Consolida (edita o quita entradas) y vuelve a intentarlo.` }
  }
  return { ok: true, entradas: nuevas, error: '', uso, limite }
}

// Reemplaza un fragmento único de una entrada (patch): evita borrar otros hechos por accidente
export function parcharEntrada(entradas, viejo, nuevo, limite) {
  const lista = Array.isArray(entradas) ? entradas : []
  const v = String(viejo || '')
  const idx = lista.map((e, i) => [i, String(e?.texto ?? e ?? '')]).filter(([, t]) => v && t.includes(v))
  if (idx.length !== 1) return { ok: false, entradas: lista, error: idx.length ? 'El fragmento aparece en varias entradas: usa uno más largo' : 'No encontré ese fragmento', uso: usoMemoria(lista), limite }
  const [i, t] = idx[0]
  const texto = t.replace(v, String(nuevo || '')).trim()
  if (!texto) return quitarEntrada(lista, t, limite)
  const error = revisarEntrada(texto)
  if (error) return { ok: false, entradas: lista, error, uso: usoMemoria(lista), limite }
  const nuevas = lista.map((e, j) => (j === i ? { ...(typeof e === 'object' ? e : {}), texto } : e))
  const uso = usoMemoria(nuevas)
  if (uso > limite) return { ok: false, entradas: lista, error: `No cabe: quedaría en ${uso}/${limite} caracteres`, uso: usoMemoria(lista), limite }
  return { ok: true, entradas: nuevas, error: '', uso, limite }
}

export function quitarEntrada(entradas, fragmento, limite) {
  const lista = Array.isArray(entradas) ? entradas : []
  const f = String(fragmento || '')
  const nuevas = lista.filter(e => !(f && String(e?.texto ?? e ?? '').includes(f)))
  if (nuevas.length === lista.length) return { ok: false, entradas: lista, error: 'No encontré esa entrada', uso: usoMemoria(lista), limite }
  return { ok: true, entradas: nuevas, error: '', uso: usoMemoria(nuevas), limite }
}

// Entradas que caben en el límite, de la más reciente hacia atrás (para datos viejos que ya se pasaron)
export function recortarAlLimite(entradas, limite) {
  const lista = (Array.isArray(entradas) ? entradas : []).filter(e => !revisarEntrada(e?.texto ?? e))
  const out = []
  for (let i = lista.length - 1; i >= 0; i--) {
    if (usoMemoria([lista[i], ...out]) > limite) break
    out.unshift(lista[i])
  }
  return out
}

const miles = (n) => n.toLocaleString('es-CO')
// Bloque que va al prompt: encabezado con el uso y las entradas separadas por §
export function bloqueMemoria(titulo, entradas, limite, ayuda = '') {
  const lista = recortarAlLimite(entradas, limite)
  if (!lista.length) return ''
  const uso = usoMemoria(lista)
  return [
    `## ${titulo} [${Math.round((uso / limite) * 100)}% — ${miles(uso)}/${miles(limite)}]`,
    ayuda,
    textos(lista).join(SEPARADOR),
  ].filter(Boolean).join('\n')
}
