import React, { useEffect, useRef, useState } from 'react'

// Confirmación propia (QA 13) en lugar del confirm() del navegador: mismo estilo que el resto de modales,
// funciona en tema oscuro y no bloquea la pestaña. Uso: if (!(await confirmar('¿Eliminar?'))) return
let abrir = null

export function confirmar(mensaje, { boton = 'Confirmar', peligro = true, titulo = 'Confirmar' } = {}) {
  // Sin el host montado (no debería pasar) se usa el del navegador para no perder la confirmación
  if (!abrir) return Promise.resolve(window.confirm(mensaje))
  return new Promise(resolve => abrir({ mensaje, boton, peligro, titulo, resolve }))
}

export default function ConfirmarHost() {
  const [pedido, setPedido] = useState(null)
  const botonRef = useRef(null)

  useEffect(() => {
    abrir = (p) => setPedido(p)
    return () => { abrir = null }
  }, [])

  useEffect(() => {
    if (!pedido) return
    botonRef.current?.focus()
    const tecla = (e) => { if (e.key === 'Escape') responder(false) }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [pedido])

  const responder = (si) => {
    pedido?.resolve(si)
    setPedido(null)
  }

  if (!pedido) return null
  return (
    <div className="modal-overlay" style={{ zIndex: 900 }} onMouseDown={e => { if (e.target === e.currentTarget) responder(false) }}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo" style={{ maxWidth: 420 }}>
        <h3 id="confirmar-titulo" style={{ margin: '0 0 10px', fontSize: 16 }}>{pedido.titulo}</h3>
        <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--text-2)', whiteSpace: 'pre-line' }}>{pedido.mensaje}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => responder(false)}>Cancelar</button>
          <button ref={botonRef} className="btn btn-primary btn-sm" onClick={() => responder(true)}
            style={pedido.peligro ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : undefined}>
            {pedido.boton}
          </button>
        </div>
      </div>
    </div>
  )
}
