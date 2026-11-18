// Publicación en redes (YouTube, TikTok, Facebook, Instagram) con el conector vidIQ de claude.ai.
// Flujo: el dueño aprueba un video → el motor crea una tarea "Publicar" para el publicador del cliente →
// el agente sube el video y deja un BORRADOR en vidIQ (no publica) → el dueño revisa el borrador en el panel →
// al aprobarlo, el motor hace una llamada corta a Claude que solo puede publicar ese borrador.
// Aquí van las funciones puras (qué publicar, validaciones) y la subida del archivo a vidIQ.
import { createReadStream, statSync, realpathSync, readdirSync, existsSync, readFileSync, openSync, readSync, closeSync } from 'node:fs'
import { join, relative, isAbsolute, extname, sep } from 'node:path'

export const REDES = ['YOUTUBE', 'TIKTOK', 'FACEBOOK_PAGES', 'INSTAGRAM']
const EXT_PUBLICABLE = ['.mp4', '.mov']
const FINAL = /_(short|youtube)_v\d+\.(mp4|mov)$/i

// ---------- ¿qué se publica? ----------
// Videos finales de una carpeta aprobada (nombres de entregar_video: <Cliente>_<tema>_<short|youtube>_v<N>.mp4)
export function videosFinales(dir) {
  const out = []
  const recorrer = (d) => {
    let items = []
    try { items = readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const it of items) {
      const p = join(d, it.name)
      if (it.isDirectory()) { if (it.name !== 'trabajo') recorrer(p) }
      else if (FINAL.test(it.name)) out.push({ ruta: p, formato: it.name.match(FINAL)[1].toLowerCase() })
    }
  }
  recorrer(dir)
  return out.sort((a, b) => a.ruta.localeCompare(b.ruta))
}

// Cuentas a las que sí se publica: activas en el perfil del cliente y con id de vidIQ
export function destinosActivos(pub = {}) {
  return REDES.map(red => ({ red, ...(pub.cuentas?.[red] || {}) }))
    .filter(c => c.activa !== false && String(c.platformAccountId || '').trim())
}

// ¿Esta tarea aprobada debe generar una tarea de publicación? Devuelve el motivo si no.
export function decidirPublicacion({ tarea = {}, cliente = {}, videos = [] }) {
  const pub = cliente.publicacion || {}
  if (tarea.publicacion?.tipo === 'publicar') return { publicar: false, motivo: 'ya es una tarea de publicación' }
  if (tarea.publicacionTareaId) return { publicar: false, motivo: 'ya se creó su tarea de publicación' }
  if (!pub.activo) return { publicar: false, motivo: 'el cliente no tiene "Publicar al aprobar"' }
  if (!pub.publicadorId) return { publicar: false, motivo: 'el cliente no tiene agente publicador' }
  if (!destinosActivos(pub).length) return { publicar: false, motivo: 'el cliente no tiene cuentas conectadas' }
  if (!videos.length) return { publicar: false, motivo: 'la entrega no trae videos finales' }
  return { publicar: true }
}

// Texto de los ajustes que vidIQ exige que decida el creador (los puso el dueño en el perfil del cliente)
export function ajustesTexto(pub = {}) {
  const a = pub.ajustes || {}
  const l = []
  for (const d of destinosActivos(pub)) {
    if (d.red === 'YOUTUBE') l.push(`- YouTube (platformAccountId ${d.platformAccountId}): privacyStatus ${a.youtubePrivacidad || 'private'}${a.youtubeCategoria ? `, categoryId ${a.youtubeCategoria}` : ''}. Necesita title (máx. 100 caracteres).`)
    if (d.red === 'TIKTOK') l.push(`- TikTok (platformAccountId ${d.platformAccountId}): privacyLevel ${a.tiktokPrivacidad || 'SELF_ONLY'}, allowComment ${a.tiktokComentarios !== false}, musicUsageConfirmed ${a.tiktokMusicaConfirmada === true}, isAiGenerated ${a.contenidoIA === true}.`)
    if (d.red === 'FACEBOOK_PAGES') l.push(`- Facebook (platformAccountId ${d.platformAccountId}).`)
    if (d.red === 'INSTAGRAM') l.push(`- Instagram (platformAccountId ${d.platformAccountId}).`)
  }
  return l.join('\n')
}

// Datos de la tarea "Publicar: …" que crea el motor
export function tareaDePublicacion({ tarea = {}, cliente = {}, carpeta, videos = [], hora = '' }) {
  const pub = cliente.publicacion || {}
  const lista = videos.map(v => `- ${v.formato === 'short' ? 'Vertical (Shorts/TikTok/Reels)' : 'Horizontal (YouTube)'}: ${v.ruta}`).join('\n')
  const descripcion = [
    `Publica en las redes del cliente el video aprobado de la tarea "${tarea.tarea}".`,
    '', 'Videos aprobados:', lista,
    '', 'Cuentas y ajustes (decididos por el dueño, úsalos tal cual):', ajustesTexto(pub),
    hora ? `\nHora de publicación pedida: ${hora}` : '',
    '', 'Busca el título, la descripción y los hashtags por red en el paquete del guionista (buscar_historial o en la carpeta Aprobados del cliente). Si no hay, escríbelos tú.',
    'NO publiques: deja el borrador en vidIQ y entrega el resumen. El dueño lo aprueba en el panel y el motor lo publica.',
  ].filter(x => x !== '').join('\n')
  return {
    tarea: `Publicar: ${tarea.tarea}`,
    descripcion,
    publicacion: { tipo: 'publicar', origenTareaId: tarea.id || '', carpeta, videos: videos.map(v => v.ruta), estado: 'borrador' },
  }
}

// ---------- borrador que deja el agente ----------
// El agente escribe salida/publicacion.json con { postId, revision } o { borradores: [{ postId, revision }, …] }.
// Se valida antes de publicar.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function leerBorrador(ruta) {
  if (!existsSync(ruta)) return { ok: false, motivo: 'el agente no dejó salida/publicacion.json' }
  let j
  try { j = JSON.parse(readFileSync(ruta, 'utf8')) } catch { return { ok: false, motivo: 'salida/publicacion.json no es JSON válido' } }
  const lista = Array.isArray(j?.borradores) ? j.borradores : [j]
  if (!lista.length || lista.length > 5) return { ok: false, motivo: 'salida/publicacion.json no trae borradores' }
  const borradores = []
  for (const b of lista) {
    if (!UUID.test(String(b?.postId || ''))) return { ok: false, motivo: 'postId inválido en salida/publicacion.json' }
    const revision = String(b.revision || '').trim()
    if (!revision || revision.length > 256 || /["\n\r]/.test(revision)) return { ok: false, motivo: 'revision inválida en salida/publicacion.json' }
    borradores.push({ postId: b.postId, revision })
  }
  return { ok: true, borradores }
}

// Prompt de la llamada corta que publica (solo tiene vidiq_social_post_publish, post_status y job_poll)
export function promptPublicar(borradores = []) {
  return [
    'El dueño ya aprobó estos borradores de vidIQ en el panel de la oficina. Tu único trabajo es publicarlos.',
    ...borradores.map((b, i) => `${i + 1}. Llama a mcp__claude_ai_vidIQ__vidiq_social_post_publish con postId "${b.postId}" y revision "${b.revision}".`),
    'Si la revision cambió o hay un error, NO intentes otra cosa: explícalo en "error".',
    'Si salió bien, consulta vidiq_social_post_status de cada postId (hasta 3 veces) para ver el estado de cada destino.',
    'Responde SOLO con un JSON en una línea: {"ok":true|false,"destinos":[{"red":"...","estado":"...","url":"..."}],"error":"..."}',
  ].join('\n')
}

export function leerResultadoPublicacion(texto = '') {
  const m = String(texto).match(/\{[\s\S]*\}/)
  if (!m) return { ok: false, destinos: [], error: 'sin respuesta legible' }
  try {
    const j = JSON.parse(m[0])
    return { ok: j.ok === true, destinos: Array.isArray(j.destinos) ? j.destinos.slice(0, 10) : [], error: j.error ? String(j.error).slice(0, 500) : '' }
  } catch { return { ok: false, destinos: [], error: 'respuesta no es JSON' } }
}

// ---------- subida del archivo a vidIQ ----------
// vidiq_video_upload({localFile}) devuelve un comando sh que sube a un enlace firmado de Google Storage.
// No ejecutamos ese script: sacamos el enlace firmado, lo validamos y hacemos la misma subida reanudable en Node.
export function urlDeSubida(comando = '') {
  const candidatas = String(comando).match(/https:\/\/[^\s'"]+/g) || []
  for (const c of candidatas) {
    let u
    try { u = new URL(c) } catch { continue }
    if (u.hostname === 'storage.googleapis.com' && u.pathname.startsWith('/vidiq-user-videos/') && u.searchParams.get('Signature')) return u.toString()
  }
  return null
}

// La ruta tiene que ser un video dentro de la carpeta aprobada de esta tarea (AGENTES_PUBLICAR_DIR)
export function rutaPublicable(ruta, carpeta) {
  if (!carpeta) return { ok: false, motivo: 'esta tarea no es de publicación (sin carpeta aprobada)' }
  if (!ruta || !isAbsolute(ruta)) return { ok: false, motivo: 'pasa la ruta absoluta del video' }
  let real, base
  try { real = realpathSync(ruta); base = realpathSync(carpeta) } catch { return { ok: false, motivo: 'no encuentro el archivo' } }
  const rel = relative(base, real)
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) return { ok: false, motivo: 'solo se pueden subir videos de la carpeta aprobada de esta tarea' }
  if (!EXT_PUBLICABLE.includes(extname(real).toLowerCase())) return { ok: false, motivo: 'solo MP4 o MOV' }
  // Misma comprobación que el script de vidIQ: cabecera de contenedor MP4/MOV
  const b = Buffer.alloc(4)
  const fd = openSync(real, 'r'); try { readSync(fd, b, 0, 4, 4) } finally { closeSync(fd) }
  if (!['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].includes(b.toString('latin1'))) return { ok: false, motivo: 'el archivo no es un MP4/MOV válido' }
  return { ok: true, ruta: real, bytes: statSync(real).size, tipo: extname(real).toLowerCase() === '.mov' ? 'video/quicktime' : 'video/mp4' }
}

// Subida reanudable de Google Storage: POST de inicio → Location → PUT del archivo
export async function subirReanudable({ ruta, url, tipo, bytes, fetchFn = fetch }) {
  const inicio = await fetchFn(url, { method: 'POST', headers: { 'x-goog-resumable': 'start', 'x-upload-content-type': tipo, 'x-upload-content-length': String(bytes), 'Content-Length': '0' } })
  const sesion = inicio.headers.get('location')
  if (!inicio.ok || !sesion) throw new Error(`Storage rechazó el enlace de subida (HTTP ${inicio.status}); pide uno nuevo con vidiq_video_upload`)
  const r = await fetchFn(sesion, { method: 'PUT', headers: { 'Content-Type': tipo, 'Content-Length': String(bytes) }, body: createReadStream(ruta), duplex: 'half' })
  if (r.status !== 200 && r.status !== 201) throw new Error(`La subida no terminó (HTTP ${r.status})`)
  return true
}

// ---------- Cuentas conectadas (puente panel ↔ vidIQ) ----------
// El panel no puede hablar con vidIQ (el conector vive en la cuenta de Claude): pide al motor en redesOps, el motor
// corre Claude solo con la herramienta de vidIQ que toca y publica el resultado en config/redesSociales.
export const PLATAFORMAS_CONECTABLES = ['YOUTUBE', 'TIKTOK', 'FACEBOOK_PAGES', 'INSTAGRAM']

export function promptCuentas() {
  return [
    'Llama a mcp__claude_ai_vidIQ__vidiq_social_account_list sin filtros. Si "partial" trae plataformas, vuelve a llamarla una vez.',
    'Responde SOLO con el JSON que devolvió la herramienta (el objeto con "accounts"), en una línea, sin comentarios.',
  ].join('\n')
}

const texto = (v, max = 200) => (v == null ? '' : String(v).slice(0, max))
const urlImagen = (v) => { try { const u = new URL(String(v)); return u.protocol === 'https:' ? u.toString().slice(0, 1500) : '' } catch { return '' } }

// Saca la lista de cuentas de la respuesta de Claude y deja solo campos conocidos (va a Firestore y al panel)
export function parsearCuentas(respuesta = '') {
  const m = String(respuesta).match(/\{[\s\S]*\}/)
  if (!m) return null
  let j
  try { j = JSON.parse(m[0]) } catch { return null }
  if (!Array.isArray(j.accounts)) return null
  return j.accounts.slice(0, 50).filter(a => a && PLATAFORMAS_CONECTABLES.includes(a.platform) && a.platformAccountId).map(a => ({
    platform: a.platform, platformAccountId: texto(a.platformAccountId, 256),
    displayName: texto(a.displayName), username: texto(a.username), avatarUrl: urlImagen(a.avatarUrl),
    canPublish: a.canPublish === true, connectionActive: a.connectionActive !== false, source: texto(a.source, 40),
  }))
}

export function promptConectar(platform, platformAccountId = '') {
  if (!PLATAFORMAS_CONECTABLES.includes(platform)) throw new Error('Plataforma no válida')
  if (platformAccountId && !/^[\w.-]{1,256}$/.test(platformAccountId)) throw new Error('ID de cuenta no válido')
  const llamada = platform === 'YOUTUBE'
    ? 'Llama a mcp__claude_ai_vidIQ__vidiq_connect_youtube_channel sin argumentos.'
    : `Llama a mcp__claude_ai_vidIQ__vidiq_social_account_connect con platform "${platform}"${platform === 'INSTAGRAM' ? ' y mode "oauth"' : ''}${platformAccountId ? ` y platformAccountId "${platformAccountId}"` : ''}.`
  return [
    llamada,
    'No abras ni visites el enlace: solo devuélvelo.',
    'Responde SOLO con un JSON en una línea: {"url":"<enlace de autorización>","estado":"<status o connected>","mensaje":"<nota breve>"}',
  ].join('\n')
}

// Solo enlaces de autorización de vidIQ o de las redes (nada más llega al botón del panel)
const HOSTS_AUTORIZACION = ['mcp.vidiq.com', 'app.vidiq.com', 'api.vidiq.com', 'www.tiktok.com', 'www.facebook.com', 'm.facebook.com', 'www.instagram.com', 'api.instagram.com', 'accounts.google.com']
export function urlAutorizacionValida(url) {
  let u
  try { u = new URL(String(url)) } catch { return null }
  return u.protocol === 'https:' && HOSTS_AUTORIZACION.includes(u.hostname) ? u.toString() : null
}

export function parsearConexion(respuesta = '') {
  const m = String(respuesta).match(/\{[\s\S]*\}/)
  let j = {}
  if (m) { try { j = JSON.parse(m[0]) } catch { j = {} } }
  // Si el JSON no trae el enlace, se busca cualquier enlace válido en el texto
  const url = urlAutorizacionValida(j.url) || (String(respuesta).match(/https:\/\/[^\s"'<>)]+/g) || []).map(urlAutorizacionValida).find(Boolean) || null
  return { url, estado: texto(j.estado, 60), mensaje: texto(j.mensaje, 300) }
}
