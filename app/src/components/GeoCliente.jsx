import React, { useEffect, useMemo, useState } from 'react'
import { useApp } from '../App.jsx'
import { db } from '../firebase.js'
import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { resumenGeo } from '../../../motor/geo.mjs'

// GEO (fase C4): resultados de "¿las IA recomiendan a esta marca?" por semana y botón para medir ahora.
// La configuración (marca, preguntas, modelos) se edita en el formulario de la ficha y se guarda con el resto.
export default function GeoCliente({ clienteId, configurado }) {
  const { showToast, user } = useApp()
  const [items, setItems] = useState([])
  const [pedido, setPedido] = useState(null)
  const [pedidoId, setPedidoId] = useState(null)

  useEffect(() => {
    if (!clienteId) return
    return onSnapshot(query(collection(db, 'geoResultados', clienteId, 'items'), orderBy('creadoAt', 'desc'), limit(300)),
      s => setItems(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => console.warn('GEO:', e.code))
  }, [clienteId])
  useEffect(() => { if (pedidoId) return onSnapshot(doc(db, 'geoPedidos', pedidoId), s => setPedido(s.data() || null)) }, [pedidoId])

  const semanas = useMemo(() => {
    const m = new Map()
    for (const x of items) m.set(x.fecha, [...(m.get(x.fecha) || []), x])
    return [...m.entries()].slice(0, 6).map(([fecha, l]) => ({ fecha, ...resumenGeo(l), items: l }))
  }, [items])

  const medir = async () => {
    try {
      const r = await addDoc(collection(db, 'geoPedidos'), { clienteId, estado: 'pendiente', creadoPor: user.email, creadoAt: serverTimestamp() })
      setPedidoId(r.id); setPedido({ estado: 'pendiente' })
    } catch (e) { console.error(e); showToast('No se pudo pedir la medición', 'error') }
  }
  const ocupado = pedido && ['pendiente', 'midiendo'].includes(pedido.estado)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>Resultados</strong>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!configurado || ocupado} onClick={medir} title={configurado ? '' : 'Guarda primero marca, preguntas y modelos'}>
          {ocupado ? (pedido.estado === 'midiendo' ? 'Midiendo…' : 'En cola…') : 'Medir ahora'}
        </button>
        {pedido?.estado === 'listo' && <span style={{ fontSize: 12.5 }}>Listo: citada en {pedido.resumen?.citadas}/{pedido.resumen?.total} ({pedido.resumen?.pct} %)</span>}
        {pedido?.estado === 'error' && <span style={{ fontSize: 12.5, color: 'var(--danger)' }}>{pedido.error}</span>}
      </div>
      {semanas.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>Todavía no hay mediciones. Se miden solas cada semana con el motor encendido.</p>}
      {semanas.map(s => (
        <details key={s.fecha} style={{ background: 'var(--bg-2)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
          <summary style={{ cursor: 'pointer' }}>
            <strong>{s.fecha}</strong> · citada en {s.citadas}/{s.total} respuestas (<strong>{s.pct} %</strong>)
            {s.proveedores.map(p => ` · ${p.proveedor}: ${p.pct} %${p.lugarMedio ? ` (lugar ${p.lugarMedio})` : ''}`).join('')}
          </summary>
          {s.competidores.length > 0 && <div style={{ marginTop: 6 }}>Competidores nombrados: {s.competidores.slice(0, 6).map(c => `${c.nombre} (${c.pct} %)`).join(', ')}</div>}
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {s.items.map(x => (
              <li key={x.id} style={{ marginBottom: 4 }}>
                {x.citada ? '✅' : '—'} <em>{x.proveedor}</em>: “{x.prompt}”
                {x.citada && x.fragmento ? <div style={{ fontSize: 12, color: 'var(--text-3)' }}>…{x.fragmento}…</div> : null}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  )
}
