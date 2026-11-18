import React from 'react'

// Consumo de Claude Code que publica el motor (config/agentWorker → consumoClaude).
// Con Pro o Max: corridas en la ventana de 5 h y en la semana contra el umbral del panel. Con API: USD gastados.
const hora = (ms) => new Date(ms).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

function Barra({ etiqueta, usados, limite, pct }) {
  const color = pct >= 100 ? 'var(--danger)' : pct >= 75 ? 'var(--warning)' : 'var(--success)'
  return (
    <div style={{ flex: 1, minWidth: 160 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)' }}>
        <span>{etiqueta}</span><span>{usados} / {limite} · {pct}%</span>
      </div>
      <div style={{ height: 8, background: 'var(--bg-3, rgba(127,127,127,0.18))', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color }} />
      </div>
    </div>
  )
}

export default function MedidorClaude({ c }) {
  if (!c) return <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Enciende el motor para ver el consumo de Claude.</div>
  const plan = { pro: 'Claude Pro', max: 'Claude Max', api: 'Clave de API' }[c.plan] || c.plan
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12.5 }}>
        <strong>{plan}</strong>
        {c.saturado
          ? <span style={{ color: 'var(--warning)' }}> · en reserva ({c.motivo}){c.bloqueadoHasta ? `, hasta las ${hora(c.bloqueadoHasta)}` : c.liberaEn ? `, se libera un cupo a las ${hora(c.liberaEn)}` : ''}. Las tareas que pueden hacerlo van a los otros motores.</span>
          : <span style={{ color: 'var(--success)' }}> · disponible</span>}
      </div>
      {c.plan === 'api'
        ? <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Gastado: USD {c.usd5h} en 5 h · USD {c.usdSemana} en 7 días</div>
        : (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Barra etiqueta="Últimas 5 h" usados={c.usos5h} limite={c.limite5h} pct={c.pct5h} />
            <Barra etiqueta="Últimos 7 días" usados={c.usosSemana} limite={c.limiteSemana} pct={c.pctSemana} />
          </div>
        )}
      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
        Cuenta las corridas de Claude del motor (tareas, revisiones y chats). Tu uso de Claude fuera del motor (claude.ai, Claude Code en tu PC)
        gasta el mismo límite y el motor no lo ve: si Claude responde "límite de uso", queda en pausa hasta la hora de reinicio.
      </div>
    </div>
  )
}
