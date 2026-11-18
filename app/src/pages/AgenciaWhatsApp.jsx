import React, { useEffect, useMemo, useState } from 'react'
import { useApp } from '../App.jsx'
import { db } from '../firebase.js'
import { collection, doc, onSnapshot, updateDoc, deleteDoc, addDoc, query, orderBy, limit, serverTimestamp } from 'firebase/firestore'

// Agencia → WhatsApp (fase B9). Los números nuevos llegan como "pendientes" con un código de emparejamiento.
// Un admin decide: dueño (habla con el coordinador), cliente (su mensaje va a esta bandeja y responde una persona)
// o bloqueado. Nada se le envía a un cliente sin que alguien lo escriba aquí.
const toMs = (ts) => ts?.toMillis?.() || (ts?.seconds ? ts.seconds * 1000 : 0)
const VENTANA = 24 * 60 * 60 * 1000

export default function AgenciaWhatsApp() {
  const { clientDocs, showToast, user, userProfile } = useApp()
  const [contactos, setContactos] = useState([])
  const [mensajes, setMensajes] = useState([])
  const [sel, setSel] = useState(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => onSnapshot(collection(db, 'whatsappContactos'), s => setContactos(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => console.warn('WhatsApp contactos:', e.code)), [])
  useEffect(() => onSnapshot(query(collection(db, 'whatsappMensajes'), orderBy('ts', 'desc'), limit(400)), s => setMensajes(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => console.warn('WhatsApp mensajes:', e.code)), [])

  const pendientes = contactos.filter(c => c.estado === 'pendiente')
  const aprobados = contactos.filter(c => c.estado !== 'pendiente')
  const nombreCliente = (id) => clientDocs.find(c => c.id === id)?.nombre || ''

  const conversaciones = useMemo(() => {
    const m = new Map()
    for (const x of mensajes) {
      const c = m.get(x.numero) || { numero: x.numero, nombre: x.nombre, cliente: x.cliente, mensajes: [], sinLeer: 0 }
      c.mensajes.push(x)
      m.set(x.numero, c)
    }
    return [...m.values()].map(c => ({ ...c, mensajes: c.mensajes.sort((a, b) => toMs(a.ts) - toMs(b.ts)), ultimo: Math.max(...c.mensajes.map(x => toMs(x.ts))) }))
      .sort((a, b) => b.ultimo - a.ultimo)
  }, [mensajes])

  const decidir = async (c, cambios, aviso) => {
    try { await updateDoc(doc(db, 'whatsappContactos', c.id), { ...cambios, decididoPor: userProfile?.name || user.email, decididoAt: serverTimestamp() }); showToast(aviso) }
    catch (e) { console.error(e); showToast('No se pudo guardar', 'error') }
  }

  const actual = conversaciones.find(c => c.numero === sel)
  const contactoSel = contactos.find(c => c.id === sel)
  const ventana = contactoSel && Date.now() - toMs(contactoSel.ultimoMensajeAt) < VENTANA

  const responder = async () => {
    const t = texto.trim()
    if (!t || !contactoSel) return
    setEnviando(true)
    try {
      await addDoc(collection(db, 'whatsappMensajes'), {
        numero: contactoSel.id, nombre: contactoSel.nombre || '', direccion: 'saliente', texto: t.slice(0, 8000), estado: 'pendiente_envio',
        clienteId: contactoSel.clienteId || '', cliente: nombreCliente(contactoSel.clienteId), enviadoPor: userProfile?.name || user.email, ts: serverTimestamp(),
      })
      setTexto('')
    } catch (e) { console.error(e); showToast('No se pudo enviar', 'error') }
    setEnviando(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {pendientes.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--warning, #e0a100)' }}>
          <strong style={{ fontSize: 14 }}>Piden acceso ({pendientes.length})</strong>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 10px' }}>
            Aprueba solo números que conozcas: compara el código con el que te dé la persona.
          </p>
          {pendientes.map(c => <Pendiente key={c.id} c={c} clientDocs={clientDocs} decidir={decidir} />)}
        </div>
      )}

      <div className="card">
        <strong style={{ fontSize: 14 }}>Contactos</strong>
        {aprobados.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Todavía no hay contactos. Cuando alguien escriba al número de WhatsApp aparecerá arriba para aprobarlo.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {aprobados.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 10, flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ flex: 1, minWidth: 180 }}>
                <strong>{c.nombre || 'Sin nombre'}</strong> · +{c.id} · {c.estado === 'bloqueado' ? 'Bloqueado' : c.rol === 'dueno' ? 'Dueño (habla con el coordinador)' : `Cliente${c.clienteId ? `: ${nombreCliente(c.clienteId)}` : ''}`}
              </span>
              {c.estado === 'bloqueado'
                ? <button className="btn btn-ghost btn-sm" onClick={() => decidir(c, { estado: 'aprobado' }, 'Desbloqueado')}>Desbloquear</button>
                : <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => decidir(c, { estado: 'bloqueado' }, 'Bloqueado: el motor ignora sus mensajes')}>Bloquear</button>}
              <button className="btn btn-ghost btn-sm" onClick={async () => { if (confirm('¿Borrar el contacto? Si vuelve a escribir, tendrá que pedir acceso otra vez.')) await deleteDoc(doc(db, 'whatsappContactos', c.id)).catch(() => showToast('No se pudo borrar', 'error')) }}>Borrar</button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <strong style={{ fontSize: 14 }}>Bandeja de clientes</strong>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 10px' }}>
          Los mensajes de clientes no los contesta ningún agente: quedan aquí y en el historial del cliente (los agentes los
          pueden buscar). WhatsApp solo deja escribir dentro de las 24 h siguientes a su último mensaje.
        </p>
        {conversaciones.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Sin mensajes.</p>}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200, flex: '0 0 220px' }}>
            {conversaciones.map(c => (
              <button key={c.numero} type="button" className={`btn btn-sm ${sel === c.numero ? 'btn-primary' : 'btn-secondary'}`} style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => setSel(c.numero)}>
                {c.nombre || '+' + c.numero}{c.cliente ? ` · ${c.cliente}` : ''}
              </button>
            ))}
          </div>
          {actual && (
            <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: 'var(--bg-2)', borderRadius: 10 }}>
                {actual.mensajes.map(m => (
                  <div key={m.id} style={{ alignSelf: m.direccion === 'saliente' ? 'flex-end' : 'flex-start', maxWidth: '80%', padding: '6px 10px', borderRadius: 10, fontSize: 13, whiteSpace: 'pre-wrap',
                    background: m.direccion === 'saliente' ? 'var(--purple)' : 'var(--card)', color: m.direccion === 'saliente' ? '#fff' : 'inherit' }}>
                    {m.texto}
                    <div style={{ fontSize: 10.5, opacity: 0.75, marginTop: 2 }}>
                      {toMs(m.ts) ? new Date(toMs(m.ts)).toLocaleString('es') : ''}
                      {m.direccion === 'saliente' ? ` · ${m.enviadoPor || ''} · ${m.estado === 'enviado' ? 'enviado' : m.estado === 'error' ? `error: ${m.error}` : 'enviando…'}` : ''}
                    </div>
                  </div>
                ))}
              </div>
              {contactoSel?.estado === 'aprobado' ? (
                ventana ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <textarea className="form-textarea" rows={2} style={{ flex: 1 }} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe la respuesta (la envía el motor)" />
                    <button className="btn btn-primary btn-sm" disabled={enviando || !texto.trim()} onClick={responder}>Enviar</button>
                  </div>
                ) : <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Pasaron más de 24 h desde su último mensaje: WhatsApp solo permite plantillas aprobadas. Espera a que vuelva a escribir.</span>
              ) : <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>El contacto no está aprobado.</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Pendiente({ c, clientDocs, decidir }) {
  const [rol, setRol] = useState('cliente')
  const [clienteId, setClienteId] = useState('')
  const aprobar = () => {
    if (rol === 'cliente' && !clienteId) { alert('Elige a qué cliente pertenece este número'); return }
    if (rol === 'dueno' && !confirm('Como dueño, este número podrá hablar con el coordinador (que lee tu correo y calendario). ¿Seguro que es tu número?')) return
    decidir(c, { estado: 'aprobado', rol, clienteId: rol === 'cliente' ? clienteId : '' }, 'Contacto aprobado')
  }
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 10, flexWrap: 'wrap', fontSize: 13, marginBottom: 6 }}>
      <span style={{ flex: 1, minWidth: 200 }}>
        <strong>{c.nombre || 'Sin nombre'}</strong> · +{c.id} · código <code>{c.codigo}</code>
        {c.primerMensaje ? <div style={{ fontSize: 12, color: 'var(--text-3)' }}>“{c.primerMensaje}”</div> : null}
      </span>
      <select className="form-select" style={{ width: 'auto' }} value={rol} onChange={e => setRol(e.target.value)}>
        <option value="cliente">Cliente</option>
        <option value="dueno">Dueño</option>
      </select>
      {rol === 'cliente' && (
        <select className="form-select" style={{ width: 'auto' }} value={clienteId} onChange={e => setClienteId(e.target.value)}>
          <option value="">¿De qué cliente?</option>
          {clientDocs.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>
      )}
      <button className="btn btn-primary btn-sm" onClick={aprobar}>Aprobar</button>
      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => decidir(c, { estado: 'bloqueado' }, 'Bloqueado')}>Bloquear</button>
    </div>
  )
}
