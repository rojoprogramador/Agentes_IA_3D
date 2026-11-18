// Aprobación de acciones con efecto externo (fase B4). Funciones puras: las usan el worker, media-server.mjs
// y las pruebas (aprobaciones.test.mjs).
//
// Los agentes no tienen terminal (Bash), así que lo que puede hacer daño son las herramientas que ENVÍAN, PUBLICAN
// o GASTAN: correo, calendario (manda invitaciones), crear archivos en Drive, créditos de Magnific y, más adelante,
// escaneos y anuncios. Esas herramientas se sacan del permiso automático de Claude Code (--allowedTools) y cada uso
// pasa por la herramienta de permisos (--permission-prompt-tool mcp__agentes-media__pedir_aprobacion), que le
// pregunta al motor, y el motor a un humano: una vez / esta tarea / siempre / denegar. 5 min sin respuesta = denegar.

export const TIEMPO_APROBACION_MS = 5 * 60 * 1000
export const HERRAMIENTA_PERMISOS = 'mcp__agentes-media__pedir_aprobacion'
export const ALCANCES = ['una', 'tarea', 'siempre']

// Lista por defecto; roles/catalogo.json → accionesConAprobacion la reemplaza. Un "*" final es comodín.
export const SENSIBLES_BASE = [
  'mcp__claude_ai_Gmail__create_draft', 'mcp__claude_ai_Gmail__label_thread', 'mcp__claude_ai_Gmail__label_message',
  'mcp__claude_ai_Gmail__send*', 'mcp__claude_ai_Google_Calendar__create_event', 'mcp__claude_ai_Google_Calendar__update_event',
  'mcp__claude_ai_Google_Drive__create_file', 'mcp__claude_ai_Google_Drive__update_file', 'mcp__claude_ai_Google_Drive__share_file',
  'mcp__magnific__images_generate', 'mcp__magnific__images_upscale', 'mcp__magnific__images_expand',
  'mcp__magnific__images_remove_background', 'mcp__magnific__images_replace_background', 'mcp__magnific__images_restyle',
  'mcp__magnific__images_reimagine', 'mcp__magnific__images_relight', 'mcp__magnific__images_variations',
  'mcp__magnific__design_auto_resize', 'mcp__agentes-seguridad__run_scan',
]

export const esSensible = (tool, patrones = SENSIBLES_BASE) =>
  patrones.some(p => p.endsWith('*') ? String(tool).startsWith(p.slice(0, -1)) : tool === p)

// Las sensibles salen de --allowedTools: así Claude Code tiene que pedir permiso por cada uso
export function separarHerramientas(tools, patrones = SENSIBLES_BASE) {
  const automaticas = [], sensibles = []
  for (const t of tools) (esSensible(t, patrones) ? sensibles : automaticas).push(t)
  return { automaticas, sensibles }
}

// ¿Se decide sin preguntar?
//  - herramienta que no es de la lista de esta ejecución → denegar (p. ej. Bash o Write fuera de salida/)
//  - crear un archivo en la carpeta de Drive del propio agente → permitir (es su forma normal de entregar)
//  - aprobada "siempre" o "para esta tarea" → permitir
//  - tarea programada (nadie mirando) → denegar
//  - lo demás → preguntar a un humano
export function decisionPrevia({ tool, input = {}, sensiblesDeEstaEjecucion = [], siempre = [], deEstaTarea = [], programada = false, carpetaDrive = '' }) {
  if (!sensiblesDeEstaEjecucion.includes(tool)) return { decision: 'denegar', motivo: 'Esa herramienta no está permitida en esta tarea.' }
  if (tool === 'mcp__claude_ai_Google_Drive__create_file' && carpetaDrive && input?.parentId === carpetaDrive)
    return { decision: 'permitir', motivo: 'carpeta de entregas del agente' }
  if (siempre.includes(tool)) return { decision: 'permitir', motivo: 'aprobada siempre' }
  if (deEstaTarea.includes(tool)) return { decision: 'permitir', motivo: 'aprobada para esta tarea' }
  if (programada) return { decision: 'denegar', motivo: 'Es una tarea programada: las acciones con efecto externo se deniegan cuando nadie está mirando. Prepara el contenido y entrégalo para que el dueño lo envíe.' }
  return { decision: 'preguntar' }
}

const NOMBRES = {
  Gmail__create_draft: 'Crear borrador en Gmail', Gmail__label_thread: 'Etiquetar conversación de Gmail', Gmail__label_message: 'Etiquetar correo',
  Google_Calendar__create_event: 'Crear evento en el calendario', Google_Calendar__update_event: 'Cambiar evento del calendario',
  Google_Drive__create_file: 'Crear archivo en Google Drive', Google_Drive__update_file: 'Modificar archivo de Google Drive', Google_Drive__share_file: 'Compartir archivo de Google Drive',
}
export function nombreAccion(tool) {
  const corto = String(tool).replace(/^mcp__claude_ai_/, '')
  if (NOMBRES[corto]) return NOMBRES[corto]
  if (corto.startsWith('Gmail__send')) return 'ENVIAR correo'
  if (tool.startsWith('mcp__magnific__')) return `Magnific (gasta créditos): ${tool.slice('mcp__magnific__'.length).replace(/_/g, ' ')}`
  return tool.replace(/^mcp__/, '').replace(/__/g, ' → ')
}

const corta = (s, n) => { const x = String(s ?? '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n) + '…' : x }
const SECRETO = /(api[_-]?key|token|password|contraseña|secret|bearer)\s*[:=]\s*\S+/gi

// Lo que el humano necesita para decidir, sin volcar todo el input (puede traer un documento entero)
export function resumenAccion(tool, input = {}) {
  const i = input && typeof input === 'object' ? input : {}
  const campos = []
  const add = (k, v, n = 160) => { if (v !== undefined && v !== null && v !== '') campos.push(`${k}: ${corta(Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v, n)}`) }
  add('Para', i.to ?? i.recipients); add('CC', i.cc); add('Asunto', i.subject)
  add('Título', i.title ?? i.summary ?? i.name); add('Carpeta', i.parentId)
  add('Inicio', i.start?.dateTime ?? i.start); add('Invitados', Array.isArray(i.attendees) ? i.attendees.map(a => a?.email ?? a) : i.attendees)
  add('Compartir con', i.emailAddress ?? i.email); add('Rol', i.role)
  add('Prompt', i.prompt, 240); add('Modelo', i.model)
  add('Contenido', i.body ?? i.textContent ?? i.description ?? i.text, 300)
  if (!campos.length) campos.push(corta(JSON.stringify(i), 400))
  return campos.join('\n').replace(SECRETO, '$1: [oculto]')
}

// Respuesta que espera Claude Code de la herramienta de permisos
export const respuestaPermiso = (permitir, input, motivo = '') => permitir
  ? { behavior: 'allow', updatedInput: input }
  : { behavior: 'deny', message: motivo || 'El dueño no aprobó esta acción. No la intentes de nuevo; deja el contenido listo en tu entrega para que él lo haga.' }

// Botones de Telegram (callback_data máx. 64 bytes)
export const botonesTelegram = (id) => [
  [{ text: '✅ Una vez', callback_data: `apr:${id}:una` }, { text: '✅ Toda esta tarea', callback_data: `apr:${id}:tarea` }],
  [{ text: '✅ Siempre', callback_data: `apr:${id}:siempre` }, { text: '⛔ Denegar', callback_data: `apr:${id}:denegar` }],
]
export function parsearCallback(data) {
  const m = String(data || '').match(/^apr:([A-Za-z0-9_-]{1,40}):(una|tarea|siempre|denegar)$/)
  return m ? { id: m[1], alcance: m[2] } : null
}

export function textoAviso({ agente, tarea, accion, resumen, minutos = TIEMPO_APROBACION_MS / 60000 }) {
  return `🔐 ${agente || 'Un agente'} quiere: ${accion}\nTarea: ${tarea || '(chat)'}\n\n${resumen}\n\nSi no respondes en ${minutos} min, se deniega.`
}
