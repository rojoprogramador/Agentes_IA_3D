import React, { useEffect, useLayoutEffect, useState } from 'react'
import { pasosDe } from '../tour.js'

// Tour guiado (fase D): oscurece la pantalla, ilumina el elemento del paso y muestra la explicación al lado.
// modo 'pagina' explica la pantalla actual; 'completo' recorre todas cambiando de página.
export default function TourGuiado({ modo, page, setPage, isAdmin, onClose }) {
  const [pasos] = useState(() => pasosDe(modo, page, isAdmin))
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)
  const paso = pasos[i]

  // Cambia de pantalla si el paso es de otra
  useEffect(() => { if (paso?.pagina && paso.pagina !== page) setPage(paso.pagina) }, [i])

  // Busca el elemento (puede tardar en aparecer tras cambiar de pantalla) y sigue su posición
  useLayoutEffect(() => {
    let vivo = true, intentos = 0, el = null
    const medir = () => { if (vivo) setRect(el ? el.getBoundingClientRect() : null) }
    const buscar = () => {
      el = paso?.sel ? document.querySelector(paso.sel) : null
      if (!el && paso?.sel && intentos++ < 10) { setTimeout(buscar, 120); return }
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setTimeout(medir, 350); medir()
    }
    setRect(null); buscar()
    window.addEventListener('resize', medir); window.addEventListener('scroll', medir, true)
    return () => { vivo = false; window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true) }
  }, [i, page])

  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && i < pasos.length - 1) setI(i + 1)
      if (e.key === 'ArrowLeft' && i > 0) setI(i - 1)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [i])

  if (!paso) return null
  const M = 8
  const ancho = Math.min(360, window.innerWidth - 32)
  // Dónde va la tarjeta: debajo, encima, a la derecha o a la izquierda del elemento; si no cabe en ningún lado
  // (elemento muy grande), abajo al centro de la pantalla. Sin elemento, al centro.
  const ALTO = 230, W = window.innerWidth, H = window.innerHeight
  let pos = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  if (rect) {
    const left = Math.max(16, Math.min(rect.left, W - ancho - 16))
    const top = Math.max(16, Math.min(rect.top, H - ALTO - 16))
    if (rect.bottom + M + 12 + ALTO < H) pos = { left, top: rect.bottom + M + 12 }
    else if (rect.top - M - 12 - ALTO > 0) pos = { left, top: rect.top - M - 12 - ALTO }
    else if (rect.right + M + 12 + ancho < W) pos = { left: rect.right + M + 12, top }
    else if (rect.left - M - 12 - ancho > 0) pos = { left: rect.left - M - 12 - ancho, top }
    else pos = { left: '50%', bottom: 24, transform: 'translateX(-50%)' }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000 }} role="dialog" aria-label="Guía de la pantalla">
      {rect
        ? <div style={{ position: 'fixed', left: rect.left - M, top: rect.top - M, width: rect.width + 2 * M, height: rect.height + 2 * M, borderRadius: 10,
            boxShadow: '0 0 0 9999px rgba(10, 10, 25, 0.62)', outline: '2px solid var(--purple)', transition: 'all .25s ease', pointerEvents: 'none' }} />
        : <div style={{ position: 'fixed', inset: 0, background: 'rgba(10, 10, 25, 0.62)' }} />}
      <div style={{ position: 'fixed', width: ancho, ...pos, padding: 16, borderRadius: 14, background: 'var(--tour-fondo, #ffffff)', color: '#1a1a34', border: '1px solid var(--purple)',
        boxShadow: '0 12px 40px rgba(0,0,0,.35)', display: 'flex', flexDirection: 'column', gap: 10, zIndex: 1 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {pasos.map((_, k) => <span key={k} onClick={() => setI(k)} style={{ flex: 1, height: 4, borderRadius: 99, cursor: 'pointer', background: k <= i ? 'var(--purple)' : 'var(--border)' }} />)}
        </div>
        <strong style={{ fontSize: 15 }}>{paso.titulo}</strong>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: '#3a3a5a' }}>{paso.texto}</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#6a6a8a' }}>{i + 1} / {pasos.length}</span>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>{i === pasos.length - 1 ? 'Cerrar' : 'Saltar'}</button>
          {i > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setI(i - 1)}>← Atrás</button>}
          {i < pasos.length - 1
            ? <button className="btn btn-primary btn-sm" onClick={() => setI(i + 1)}>Siguiente →</button>
            : <button className="btn btn-primary btn-sm" onClick={onClose}>¡Listo!</button>}
        </div>
      </div>
    </div>
  )
}
