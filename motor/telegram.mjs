// Canal de Telegram del coordinador: long polling desde el PC (no necesita servidor público).
// Solo atiende al dueño (TELEGRAM_OWNER_ID); cualquier otra persona recibe un rechazo.

const API = (token, method) => `https://api.telegram.org/bot${token}/${method}`

export function startTelegram({ token, ownerId, log, onMessage, onReply, transcribe, onCallback }) {
  let offset = 0
  let stopped = false

  const call = async (method, body) => {
    const r = await fetch(API(token, method), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
    })
    const j = await r.json()
    if (!j.ok) throw new Error(j.description || method)
    return j.result
  }

  const send = async (chatId, text) => {
    const chunks = []
    for (let s = String(text || '').trim() || '(sin respuesta)'; s.length; s = s.slice(3800)) chunks.push(s.slice(0, 3800))
    // La red a veces corta la conexión con Telegram: hasta 4 intentos por mensaje
    const ids = []
    for (const c of chunks) {
      for (let i = 1; i <= 4; i++) {
        try { ids.push((await call('sendMessage', { chat_id: chatId, text: c })).message_id); break }
        catch (e) {
          if (i === 4) log('Telegram no envió:', e.message)
          else await new Promise(r => setTimeout(r, 3000 * i))
        }
      }
    }
    return ids
  }

  const typing = (chatId) => call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {})

  async function loop() {
    for (let tries = 1; ; tries++) {
      try {
        const me = await call('getMe')
        log(`Telegram conectado como @${me.username}`)
        break
      } catch (e) {
        if (/unauthorized|not found/i.test(e.message)) { log('✖ Telegram: el token no es válido. Revísalo en Agencia → Motor (o TELEGRAM_BOT_TOKEN en .env)'); return }
        log(`Telegram: sin conexión (${e.cause?.code || e.message}), reintento en 30 s`)
        await new Promise(r => setTimeout(r, 30_000))
        if (stopped) return
      }
    }
    while (!stopped) {
      try {
        const updates = await call('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] })
        for (const u of updates) {
          offset = u.update_id + 1
          // Botón pulsado (aprobaciones, B4): solo cuenta si lo pulsa el dueño
          if (u.callback_query) {
            const q = u.callback_query
            const esDueno = ownerId && String(q.from?.id) === String(ownerId)
            let texto = 'Solo mi dueño puede decidir esto.'
            if (esDueno) { try { texto = (await onCallback?.(q.data)) || 'Listo' } catch (e) { texto = 'No pude registrarlo: ' + e.message } }
            await call('answerCallbackQuery', { callback_query_id: q.id, text: String(texto).slice(0, 190) }).catch(() => {})
            if (esDueno && q.message) {
              await call('editMessageText', { chat_id: q.message.chat.id, message_id: q.message.message_id, text: `${q.message.text || ''}\n\n→ ${texto}`.slice(0, 4000) }).catch(() => {})
            }
            continue
          }
          const m = u.message
          const voice = m?.voice || (m?.audio?.mime_type === 'audio/ogg' ? m.audio : null)
          if (!m?.text && !voice) continue
          const fromId = String(m.from?.id)
          if (!ownerId) {
            log(`Telegram: mensaje de ${m.from?.first_name} con ID ${fromId}. Si eres tú, pon ${fromId} en Agencia → Motor → Tu ID de Telegram.`)
            await send(m.chat.id, `Hola. Tu ID de Telegram es ${fromId}. Aún no estoy vinculado a ningún dueño.`)
            continue
          }
          if (fromId !== String(ownerId)) {
            log(`Telegram: mensaje ignorado de un desconocido (ID ${fromId})`)
            await send(m.chat.id, 'Lo siento, solo atiendo a mi dueño.')
            continue
          }
          const keepTyping = setInterval(() => typing(m.chat.id), 4500)
          typing(m.chat.id)
          try {
            let text = m.text
            if (voice) {
              if (!transcribe) { await send(m.chat.id, 'Todavía no puedo escuchar notas de voz.'); continue }
              const file = await call('getFile', { file_id: voice.file_id })
              const r = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`)
              const bytes = new Uint8Array(await r.arrayBuffer())
              text = await transcribe(bytes)
              if (!text) { await send(m.chat.id, 'No logré entender la nota de voz. ¿Me la repites?'); continue }
              log(`Telegram: nota de voz de ${voice.duration || '?'} s transcrita`)
              await send(m.chat.id, `Escuché: "${text}"`)
            }
            // Respuesta a una pregunta de un agente (el usuario usó "Responder" sobre el aviso)
            const replyTo = m.reply_to_message?.message_id
            if (replyTo && onReply) {
              const ack = await onReply(replyTo, text)
              if (ack) { await send(m.chat.id, ack); continue }
            }
            const reply = await onMessage(text)
            await send(m.chat.id, reply)
          } catch (e) {
            await send(m.chat.id, 'Tuve un problema: ' + e.message)
          } finally {
            clearInterval(keepTyping)
          }
        }
      } catch (e) {
        log('Telegram: error de conexión, reintento en 10 s (' + e.message + ')')
        await new Promise(r => setTimeout(r, 10_000))
      }
    }
  }

  loop()
  return {
    // Devuelve los message_id enviados (para reconocer respuestas a ese aviso)
    notify: (text) => ownerId ? send(ownerId, text) : Promise.resolve([]),
    // Mensaje con botones (inline keyboard); devuelve el message_id o null
    ask: async (text, botones) => {
      if (!ownerId) return null
      try { return (await call('sendMessage', { chat_id: ownerId, text: String(text).slice(0, 3800), reply_markup: { inline_keyboard: botones } })).message_id }
      catch (e) { log('Telegram no envió la pregunta:', e.message); return null }
    },
    // Cambia el texto de un mensaje (y quita sus botones)
    edit: (messageId, text) => ownerId && messageId ? call('editMessageText', { chat_id: ownerId, message_id: messageId, text: String(text).slice(0, 4000) }).catch(() => {}) : Promise.resolve(),
    stop: () => { stopped = true },
  }
}
