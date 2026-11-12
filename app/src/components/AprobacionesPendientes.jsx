import React, { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { db } from '../firebase.js'
import { collection, doc, onSnapshot, query, updateDoc, where, serverTimestamp } from 'firebase/firestore'

// Acciones con efecto externo que esperan permiso (fase B4). Un agente quiere enviar, publicar o gastar
// (correo, calendario, Drive, créditos de Magnific) y el motor lo detuvo hasta que un admin decida aquí o en
// Telegram. Si nadie responde en 5 minutos, se deniega sola.
const toMs = (ts) => ts?.toMillis?.() || (ts?.seconds ? ts.seconds * 1000 : 0)

export default function AprobacionesPendientes() {
  const { isAdmin, user, userProfile, showToast } = useApp()
  const [items, setItems] = useState([])
  const [ahora, setAhora] = useState(Date.now())

  useEffect(() => {
    if (!isAdmin) return
    return onSnapshot(query(collection(db, 'aprobaciones'), where('estado', '==', 'pendiente')),
      snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => console.warn('Aprobaciones:', e.code))
  }, [isAdmin])
  useEffect(() => {
    if (!items.length) return
    const i = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(i)
  }, [items.length])

  const vivas = items.filter(a => toMs(a.venceAt) > ahora).sort((a, b) => toMs(a.venceAt) - toMs(b.venceAt))
  if (!isAdmin || !vivas.length) return null

  const decidir = async (a, estado, alcance = '') => {
    try {
      await updateDoc(doc(db, 'aprobaciones', a.id), { estado, alcance, decididaPor: userProfile?.name || user.email, decididaAt: serverTimestamp() })
      showToast(estado === 'aprobada' ? 'Aprobada: el agente sigue' : 'Denegada', estado === 'aprobada' ? 'success' : 'info')
    } catch (e) { console.error(e); showToast('No se pudo (quizá ya caducó)', 'error') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {vivas.map(a => {
        const seg = Math.max(0, Math.round((toMs(a.venceAt) - ahora) / 1000))
        return (
          <div key={a.id} className="card" style={{ borderLeft: '3px solid var(--warning, #e0a100)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14 }}>🔐 {a.agente || 'Un agente'} quiere: {a.accion}</strong>
              <span style={{ fontSize: 12, color: seg < 60 ? 'var(--danger)' : 'var(--text-3)' }}>
                Se deniega sola en {Math.floor(seg / 60)}:{String(seg % 60).padStart(2, '0')}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 8px' }}>Tarea: {a.tarea}</div>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, background: 'var(--bg-2)', padding: 10, borderRadius: 8, margin: 0 }}>{a.resumen}</pre>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={() => decidir(a, 'aprobada', 'una')}>Aprobar una vez</button>
              <button className="btn btn-secondary btn-sm" onClick={() => decidir(a, 'aprobada', 'tarea')} title="No vuelve a preguntar por esta acción en esta tarea">Toda esta tarea</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm(`¿Permitir "${a.accion}" SIEMPRE, en todas las tareas, sin preguntar? Lo puedes quitar en Agencia → Motor.`)) decidir(a, 'aprobada', 'siempre') }}>Siempre</button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', marginLeft: 'auto' }} onClick={() => decidir(a, 'denegada')}>Denegar</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
