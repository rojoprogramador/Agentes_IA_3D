import React, { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { db } from '../firebase.js'
import { collection, doc, getDoc, onSnapshot, query, updateDoc, where, serverTimestamp } from 'firebase/firestore'
import { agregarEntrada, revisarEntrada, LIMITES_MEMORIA } from '../../../motor/memoria.mjs'

// Aprendizaje propuesto (fase B2). Al aprobar una tarea con fricción, el motor le pide a un modelo que proponga
// memoria (del cliente o del agente) o una skill. Nada se aplica solo: aquí el admin aprueba, edita o descarta.
//  - Memoria: el panel la agrega a la ficha con el mismo límite de siempre (si no cabe, hay que consolidar).
//  - Skill: el panel la marca 'aprobada' y el motor escribe el SKILL.md en el PC.
export default function PropuestasAprendizaje() {
  const { isAdmin, user, userProfile, showToast } = useApp()
  const [items, setItems] = useState([])
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    const q = query(collection(db, 'propuestas'), where('estado', 'in', ['pendiente', 'aprobada', 'error']))
    return onSnapshot(q, snap => {
      const l = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      l.sort((a, b) => (b.creadaAt?.seconds || 0) - (a.creadaAt?.seconds || 0))
      setItems(l)
    }, e => console.warn('Propuestas:', e.code))
  }, [isAdmin])

  if (!isAdmin || !items.length) return null
  const pendientes = items.filter(p => p.estado === 'pendiente').length

  const marcar = (p, estado, extra = {}) => updateDoc(doc(db, 'propuestas', p.id), {
    estado, decididaPor: userProfile?.name || user.email, decididaAt: serverTimestamp(), ...extra,
  })

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--purple)' }}>
      <button type="button" className="btn btn-ghost" style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }} onClick={() => setAbierto(!abierto)}>
        <span style={{ fontWeight: 700 }}>🧠 Aprendizaje propuesto {pendientes ? `· ${pendientes} por revisar` : ''}</span>
        <span>{abierto ? '▲' : '▼'}</span>
      </button>
      {abierto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
            Lo propone un modelo al revisar tareas con correcciones, rechazos u observaciones. Aprueba solo lo que
            sirva para tareas futuras; puedes editar el texto antes.
          </p>
          {items.map(p => <Propuesta key={p.id} p={p} marcar={marcar} showToast={showToast} />)}
        </div>
      )}
    </div>
  )
}

function Propuesta({ p, marcar, showToast }) {
  const [texto, setTexto] = useState(p.tipo === 'skill' ? p.markdown || '' : p.texto || '')
  const [verSkill, setVerSkill] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const aprobarMemoria = async () => {
    const t = texto.trim()
    const err = revisarEntrada(t)
    if (err) { setError(err); return }
    setBusy(true)
    try {
      // Se lee la ficha en este momento para no pisar cambios de otra persona
      const ref = doc(db, p.destino.col, p.destino.id)
      const d = (await getDoc(ref)).data()
      if (!d) throw new Error(`${p.destino.nombre} ya no existe`)
      const tipo = p.destino.col === 'clients' ? 'cliente' : 'agente'
      const r = agregarEntrada(d.aprendizajes, { texto: t, origenTaskId: p.origenTaskId, fecha: new Date().toISOString() }, LIMITES_MEMORIA[tipo])
      if (!r.ok) { setError(`${r.error}. Acórtala o consolida la memoria en la ficha de ${p.destino.nombre}.`); setBusy(false); return }
      await updateDoc(ref, { aprendizajes: r.entradas })
      await marcar(p, 'aprobada', { textoFinal: t })
      showToast(`Guardado en la memoria de ${p.destino.nombre}`)
    } catch (e) { console.error(e); setError(e.message || 'No se pudo guardar') }
    setBusy(false)
  }

  const aprobarSkill = async () => {
    if (!/^---[\s\S]*\nname:\s*[a-z0-9-]{3,48}\s*\n/.test(texto)) { setError('El SKILL.md debe empezar con --- y tener "name:" en kebab-case'); return }
    setBusy(true)
    try { await marcar(p, 'aprobada', { markdown: texto, error: '' }); showToast('Aprobada: el motor la instala en cuanto la vea') }
    catch (e) { console.error(e); setError('No se pudo aprobar') }
    setBusy(false)
  }

  const descartar = async () => {
    setBusy(true)
    try { await marcar(p, 'descartada') } catch (e) { console.error(e); showToast('No se pudo descartar', 'error') }
    setBusy(false)
  }

  const esSkill = p.tipo === 'skill'
  const destino = esSkill
    ? (p.destino?.alcance === 'cliente' ? `Skill solo para ${p.destino.nombre}` : 'Skill para todos los agentes')
    : `Memoria de ${p.destino?.nombre} (${p.destino?.col === 'clients' ? 'cliente' : 'agente'})`

  return (
    <div style={{ padding: 12, background: 'var(--bg-2)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
        <span style={{ fontWeight: 700 }}>{destino}</span>
        <span style={{ color: 'var(--text-3)' }}>De "{p.tarea}" · {p.motivo} · {p.motor}</span>
      </div>
      {esSkill && <div style={{ fontSize: 13 }}><b>{p.skill?.nombre}</b>: {p.skill?.descripcion}</div>}
      {p.estado === 'aprobada' && <div style={{ fontSize: 12.5, color: 'var(--purple)' }}>Aprobada · esperando a que el motor la instale (debe estar encendido)</div>}
      {p.estado === 'error' && <div style={{ fontSize: 12.5, color: 'var(--danger)' }}>El motor no pudo instalarla: {p.error}</div>}
      {p.estado !== 'aprobada' && (
        <>
          {esSkill && !verSkill
            ? <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setVerSkill(true)}>Ver y editar el SKILL.md</button>
            : <textarea className="form-textarea" rows={esSkill ? 12 : 2} value={texto} onChange={e => { setTexto(e.target.value); setError('') }}
                style={esSkill ? { fontFamily: 'monospace', fontSize: 12 } : undefined} />}
          {error && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={esSkill ? aprobarSkill : aprobarMemoria}>
              {p.estado === 'error' ? 'Reintentar' : 'Aprobar'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={descartar}>Descartar</button>
          </div>
        </>
      )}
    </div>
  )
}
