// Historial buscable (fase B1). Todo lo que pasa en las tareas queda en una base SQLite local con búsqueda
// de texto completo (FTS5), para que un agente pueda preguntar "¿qué le entregamos antes a este cliente?".
//
//   - Lo escribe el worker (brief, entregas, revisiones, correcciones, preguntas y respuestas).
//   - Lo lee la herramienta MCP buscar_historial (media-server.mjs), SIEMPRE filtrada por el cliente de la tarea:
//     el cliente no lo elige el agente, llega en la variable de entorno AGENTES_CLIENTE que pone el motor.
//   - Sin dependencias: node:sqlite viene con Node 22.5+ y su SQLite trae FTS5.
//   - Archivo: motor/logs/historial.db (no se sube a git). Se puede borrar: el motor lo vuelve a llenar con
//     las tareas abiertas al arrancar (las cerradas antes de B1 no vuelven).
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { CREDENCIAL } from './memoria.mjs'

// Clientes: id de Firestore. Tareas internas de la agencia (sin cliente) van a este valor fijo.
export const INTERNO = '__interno__'
export const ROLES = ['brief', 'entrega', 'revision', 'correccion', 'pregunta', 'respuesta', 'whatsapp']
const MAX_TEXTO = 20000

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS mensajes (
  id INTEGER PRIMARY KEY,
  cliente_id TEXT NOT NULL,
  tarea_id TEXT NOT NULL DEFAULT '',
  tarea TEXT NOT NULL DEFAULT '',
  agente_id TEXT NOT NULL DEFAULT '',
  rol TEXT NOT NULL,
  ts INTEGER NOT NULL,
  texto TEXT NOT NULL,
  huella TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS mensajes_cliente ON mensajes(cliente_id, ts);
CREATE VIRTUAL TABLE IF NOT EXISTS mensajes_fts USING fts5(
  texto, tarea,
  content='mensajes', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS mensajes_ai AFTER INSERT ON mensajes BEGIN
  INSERT INTO mensajes_fts(rowid, texto, tarea) VALUES (new.id, new.texto, new.tarea);
END;
CREATE TRIGGER IF NOT EXISTS mensajes_ad AFTER DELETE ON mensajes BEGIN
  INSERT INTO mensajes_fts(mensajes_fts, rowid, texto, tarea) VALUES ('delete', old.id, old.texto, old.tarea);
END;`

// Las claves no se guardan nunca, aunque vengan en un brief o en una entrega
const CRED_G = new RegExp(CREDENCIAL.source, 'gi')
export const redactar = (s) => String(s || '').replace(CRED_G, '[clave omitida]')

// Convierte lo que escribe el agente en una consulta FTS5 segura: solo palabras (sin operadores, comillas ni
// paréntesis que FTS5 interpretaría), cada una entre comillas y unidas con OR. bm25 ordena por relevancia.
export function consultaSegura(texto) {
  const palabras = String(texto || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []
  return [...new Set(palabras)].slice(0, 12).map(p => `"${p}"`).join(' OR ')
}

export function abrirHistorial(ruta, { soloLectura = false } = {}) {
  if (ruta !== ':memory:' && !soloLectura) mkdirSync(dirname(ruta), { recursive: true })
  const db = new DatabaseSync(ruta, { readOnly: soloLectura })
  // WAL: el worker escribe mientras varios servidores MCP (uno por tarea) leen, sin bloquearse
  db.exec('PRAGMA busy_timeout = 3000')
  if (!soloLectura) { db.exec('PRAGMA journal_mode = WAL'); db.exec(ESQUEMA) }

  const insertar = soloLectura ? null : db.prepare(`INSERT OR IGNORE INTO mensajes
    (cliente_id, tarea_id, tarea, agente_id, rol, ts, texto, huella) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  const consultar = db.prepare(`
    SELECT m.tarea_id, m.tarea, m.rol, m.ts, snippet(mensajes_fts, 0, '«', '»', '…', 40) AS fragmento
    FROM mensajes_fts JOIN mensajes m ON m.id = mensajes_fts.rowid
    WHERE mensajes_fts MATCH ? AND m.cliente_id = ? AND m.tarea_id != ?
    ORDER BY bm25(mensajes_fts, 1.0, 2.0) LIMIT ?`)

  return {
    // Idempotente: el mismo texto de la misma tarea y rol no se guarda dos veces (huella única).
    // Así se puede llamar en cada arranque o en cada corrida sin duplicar.
    registrar({ clienteId, tareaId = '', tarea = '', agenteId = '', rol, texto, ts = Date.now() }) {
      if (!insertar) throw new Error('Historial abierto en solo lectura')
      if (!ROLES.includes(rol)) throw new Error(`Rol de historial desconocido: ${rol}`)
      const limpio = redactar(texto).trim().slice(0, MAX_TEXTO)
      if (!limpio) return false
      const cliente = clienteId || INTERNO
      const huella = createHash('sha1').update([cliente, tareaId, rol, limpio].join('\u0000')).digest('hex')
      return insertar.run(cliente, tareaId, String(tarea).slice(0, 300), agenteId, rol, ts, limpio, huella).changes > 0
    },
    // clienteId es obligatorio: no hay forma de buscar "en todos los clientes".
    // excluirTarea: la tarea actual ya está en el prompt, no hace falta devolverla.
    buscar({ clienteId, consulta, limite = 8, excluirTarea = '' }) {
      if (!clienteId) throw new Error('Falta el cliente: el historial siempre se busca dentro de un cliente')
      const q = consultaSegura(consulta)
      if (!q) return []
      return consultar.all(q, clienteId, excluirTarea, Math.min(Math.max(1, limite | 0), 20))
        .map(r => ({ tareaId: r.tarea_id, tarea: r.tarea, rol: r.rol, fecha: new Date(r.ts).toISOString().slice(0, 10), fragmento: r.fragmento }))
    },
    total: () => db.prepare('SELECT count(*) AS n FROM mensajes').get().n,
    cerrar: () => db.close(),
  }
}

// Lo que ya existe en una tarea de Firestore, para llenar el historial al arrancar (idempotente)
export function mensajesDeTarea(t, clienteId) {
  const base = { clienteId, tareaId: t.id, tarea: t.tarea || '', agenteId: t.asignado || '' }
  const fecha = (x) => (x?.toMillis ? x.toMillis() : Date.parse(x) || Date.now())
  const brief = [t.tarea, t.descripcion].filter(Boolean).join('\n\n')
  const out = []
  if (brief) out.push({ ...base, rol: 'brief', texto: brief, ts: fecha(t.createdAt) })
  for (const v of Array.isArray(t.versiones) ? t.versiones : []) {
    if (v?.output) out.push({ ...base, rol: 'entrega', texto: v.output, ts: fecha(v.fecha) })
  }
  if (t.feedback) out.push({ ...base, rol: 'correccion', texto: t.feedback })
  if (t.agentQuestion) out.push({ ...base, rol: 'pregunta', texto: t.agentQuestion })
  return out
}
