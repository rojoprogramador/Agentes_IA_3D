// Consumo de Claude Code (funciones puras, con pruebas en consumo.test.mjs).
// Con un plan de suscripción (Pro o Max), el motor comparte el límite de 5 horas y el semanal con el chat de
// claude.ai y con Claude Code en tu PC. Anthropic no publica cifras exactas, así que el motor cuenta sus propias
// corridas de Claude y, al llegar al umbral, manda las tareas nuevas a los otros motores ANTES de chocar con el límite.
// Si aun así Claude responde "límite de uso", queda bloqueado hasta la hora de reinicio que indique el mensaje.

export const H5 = 5 * 3600_000
export const SEMANA = 7 * 24 * 3600_000

// Umbrales por defecto (corridas de Claude: tareas, revisiones y chats). Son estimaciones: ajústalos en el panel.
export const LIMITES_PLAN = {
  pro: { tareas5h: 6, tareasSemana: 80 },
  max: { tareas5h: 30, tareasSemana: 400 },
  api: null, // con clave de API no hay ventana: se cobra por uso
}

export const planValido = (p) => (p in LIMITES_PLAN ? p : 'pro')

export function limitesDe(plan, propios = {}) {
  const base = LIMITES_PLAN[planValido(plan)]
  if (!base) return null
  const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : d)
  return { tareas5h: n(propios?.tareas5h, base.tareas5h), tareasSemana: n(propios?.tareasSemana, base.tareasSemana) }
}

// Registros: [{ ts, usd, turnos }]. Se guardan solo los de los últimos 7 días.
export const podar = (registros, ahora) => (registros || []).filter(r => r && ahora - r.ts < SEMANA)

export function resumen(registros, ahora, { plan, limites, bloqueadoHasta = 0 } = {}) {
  const p = planValido(plan)
  const lim = limitesDe(p, limites)
  const v5 = podar(registros, ahora).filter(r => ahora - r.ts < H5)
  const vs = podar(registros, ahora)
  const suma = (l) => Math.round(l.reduce((a, r) => a + (Number(r.usd) || 0), 0) * 100) / 100
  const pct = (n, l) => (l ? Math.min(100, Math.round((n / l) * 100)) : 0)
  const bloqueado = bloqueadoHasta > ahora
  const r = {
    plan: p, usos5h: v5.length, usosSemana: vs.length, usd5h: suma(v5), usdSemana: suma(vs),
    limite5h: lim?.tareas5h || 0, limiteSemana: lim?.tareasSemana || 0,
    pct5h: pct(v5.length, lim?.tareas5h), pctSemana: pct(vs.length, lim?.tareasSemana),
    bloqueadoHasta: bloqueado ? bloqueadoHasta : 0, saturado: false, motivo: '',
  }
  if (bloqueado) { r.saturado = true; r.motivo = 'Claude respondió que llegó a su límite de uso' }
  else if (lim && v5.length >= lim.tareas5h) { r.saturado = true; r.motivo = `umbral de ${lim.tareas5h} corridas en 5 h` }
  else if (lim && vs.length >= lim.tareasSemana) { r.saturado = true; r.motivo = `umbral de ${lim.tareasSemana} corridas en la semana` }
  // Cuándo se libera un cupo de la ventana de 5 h (la corrida más vieja sale de la ventana)
  if (!bloqueado && r.saturado && lim && v5.length >= lim.tareas5h) {
    const viejo = Math.min(...v5.map(x => x.ts))
    r.liberaEn = viejo + H5
  }
  return r
}

// Hora de reinicio que trae el mensaje de límite de Claude. Formatos conocidos:
//   "Claude AI usage limit reached|1731272400"       (segundos desde 1970)
//   "5-hour limit reached ∙ resets 3pm"  /  "resets at 3:30 PM"
// Sin hora reconocible: bloquea por `porDefectoMin` minutos.
export function hastaCuandoBloqueado(texto, ahora, porDefectoMin = 60) {
  const t = String(texto || '')
  const epoch = t.match(/limit reached\|(\d{10})\b/i)
  if (epoch) {
    const ms = Number(epoch[1]) * 1000
    if (ms > ahora) return ms
  }
  const h = t.match(/resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\b/i)
  if (h) {
    let hora = Number(h[1]) % 12
    if (h[3].toLowerCase() === 'p') hora += 12
    const d = new Date(ahora)
    d.setHours(hora, Number(h[2] || 0), 0, 0)
    if (d.getTime() <= ahora) d.setDate(d.getDate() + 1)
    return d.getTime()
  }
  return ahora + porDefectoMin * 60_000
}

// Orden de motores para una tarea: si hay que cuidar a Claude, pasa al final (queda como último recurso)
export function ordenarCadena(cadena, evitarClaude) {
  if (!evitarClaude || !cadena.includes('claude')) return [...cadena]
  return [...cadena.filter(m => m !== 'claude'), 'claude']
}
