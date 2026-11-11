import React, { useState } from 'react'
import { usoMemoria, agregarEntrada, revisarEntrada, LIMITES_MEMORIA } from '../../../motor/memoria.mjs'

// Memoria con límite (agente, cliente o perfil del dueño). Corta a propósito: si algo nuevo no cabe,
// hay que consolidar (editar o quitar) para que solo quede lo importante. Se inyecta en cada tarea.
export default function MemoriaEditor({ entradas = [], tipo = 'cliente', onChange, vacio = 'Aún no hay nada guardado.' }) {
  const limite = LIMITES_MEMORIA[tipo] || 2200
  const [nueva, setNueva] = useState('')
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(-1)
  const [texto, setTexto] = useState('')
  const uso = usoMemoria(entradas)
  const pct = Math.round((uso / limite) * 100)
  const color = pct > 100 ? 'var(--danger)' : pct >= 85 ? 'var(--warning)' : 'var(--success)'

  const agregar = () => {
    const r = agregarEntrada(entradas, { texto: nueva, fecha: new Date().toISOString() }, limite)
    if (!r.ok) { setError(r.error); return }
    setError(''); setNueva(''); onChange(r.entradas)
  }
  const guardarEdicion = (i) => {
    const t = texto.trim()
    const err = revisarEntrada(t)
    if (err) { setError(err); return }
    const nuevas = entradas.map((e, j) => (j === i ? { ...e, texto: t } : e))
    if (usoMemoria(nuevas) > limite && usoMemoria(nuevas) > uso) { setError(`No cabe: quedaría en ${usoMemoria(nuevas)}/${limite} caracteres`); return }
    setError(''); setEditando(-1); onChange(nuevas)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)' }}>
          <span>Memoria usada</span><span style={{ color: pct > 100 ? 'var(--danger)' : undefined }}>{uso.toLocaleString('es-CO')} / {limite.toLocaleString('es-CO')} caracteres · {pct}%</span>
        </div>
        <div style={{ height: 6, background: 'var(--bg-3, rgba(127,127,127,0.18))', borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color }} />
        </div>
        {pct > 100 && <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 4 }}>Se pasó del límite: los agentes solo reciben las entradas más recientes que caben. Consolida editando o quitando entradas.</div>}
      </div>
      {entradas.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>{vacio}</p>}
      {entradas.map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 8 }}>
          {editando === i ? (
            <>
              <textarea className="form-textarea" rows={2} style={{ flex: 1 }} value={texto} onChange={e => setTexto(e.target.value)} />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => guardarEdicion(i)}>Listo</button>
            </>
          ) : (
            <>
              <span style={{ flex: 1, fontSize: 13 }}>{a.texto}
                {a.fecha && <><br /><span style={{ fontSize: 11, color: 'var(--text-3)' }}>{new Date(a.fecha).toLocaleDateString('es-CO')}</span></>}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" title="Editar" onClick={() => { setEditando(i); setTexto(a.texto); setError('') }}>✎</button>
              <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} title="Quitar" onClick={() => onChange(entradas.filter((_, j) => j !== i))}>✕</button>
            </>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="form-input" value={nueva} onChange={e => setNueva(e.target.value)} placeholder="Agregar algo que deban recordar siempre"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }} />
        <button type="button" className="btn btn-secondary btn-sm" disabled={!nueva.trim()} onClick={agregar}>Agregar</button>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
    </div>
  )
}
