import React, { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { db } from '../firebase.js'
import { doc, addDoc, collection, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import Icon from '../components/Icons.jsx'

const SUGERENCIAS = ['copywriting', 'instagram', 'video', 'seo', 'diseño', 'anuncios', 'email', 'presentaciones']
const ONLINE_MS = 3 * 60 * 1000
const toMs = (ts) => ts?.toMillis?.() || (ts?.seconds ? ts.seconds * 1000 : 0)

// Pide una operación al motor y sigue su estado hasta que responde
function useSkillOp() {
  const { user } = useApp()
  const [op, setOp] = useState(null)
  const [id, setId] = useState(null)
  useEffect(() => {
    if (!id) return
    return onSnapshot(doc(db, 'skillOps', id), s => setOp(s.exists() ? { id: s.id, ...s.data() } : null))
  }, [id])
  const pedir = async (data) => {
    setOp({ estado: 'pendiente', ...data })
    const ref = await addDoc(collection(db, 'skillOps'), { ...data, estado: 'pendiente', createdBy: user.email, createdAt: serverTimestamp() })
    setId(ref.id)
    return ref.id
  }
  return [op, pedir, () => { setId(null); setOp(null) }]
}

const ocupado = (op) => op && (op.estado === 'pendiente' || op.estado === 'trabajando')

// Agencia → Skills: buscar en skills.sh (o en un repo de GitHub), revisar e instalar en el PC del motor
export default function AgenciaSkills() {
  const { showToast } = useApp()
  const [worker, setWorker] = useState(null)
  const [q, setQ] = useState('')
  const [busqueda, buscar] = useSkillOp()
  const [revision, revisar, cerrarRevision] = useSkillOp()
  const [accion, pedirAccion] = useSkillOp()
  const [filtro, setFiltro] = useState('')
  const [revActualizacion, setRevActualizacion] = useState(null) // revisión que devolvió "Buscar actualización"

  const [curadorCfg, setCuradorCfg] = useState({})
  useEffect(() => onSnapshot(doc(db, 'config', 'agentWorker'), s => setWorker(s.data() || null), () => {}), [])
  useEffect(() => onSnapshot(doc(db, 'config', 'curador'), s => setCuradorCfg(s.data() || {}), () => {}), [])
  const fijadas = curadorCfg.fijadas || []
  const fijar = async (nombre) => {
    const nuevas = fijadas.includes(nombre) ? fijadas.filter(x => x !== nombre) : [...fijadas, nombre]
    try { await setDoc(doc(db, 'config', 'curador'), { fijadas: nuevas, updatedAt: serverTimestamp() }, { merge: true }) }
    catch (e) { console.error(e); showToast('No se pudo guardar', 'error') }
  }
  const online = worker?.online && Date.now() - toMs(worker?.lastSeen) < ONLINE_MS
  const instaladas = (worker?.skills || []).filter(s => !filtro || (s.nombre + ' ' + (s.descripcion || '')).toLowerCase().includes(filtro.toLowerCase()))

  useEffect(() => {
    if (accion?.estado === 'listo') {
      const r = accion.resultado || {}
      if (accion.tipo === 'instalar') { showToast(`Skill "${r.nombre}" instalada`); cerrarRevision(); setRevActualizacion(null) }
      if (accion.tipo === 'actualizar' && r.alDia === false) setRevActualizacion(accion)
      if (accion.tipo === 'desinstalar') showToast(`Skill "${r.nombre}" quitada`, 'info')
      if (accion.tipo === 'actualizar' && r.alDia) showToast(`"${r.nombre}" ya está al día`, 'info')
      if (accion.tipo === 'restaurar') showToast(`"${r.nombre}" vuelve a estar activa`)
    }
    if (accion?.estado === 'error') showToast(accion.error || 'No se pudo', 'error')
  }, [accion?.estado])

  const lanzarBusqueda = (texto) => {
    const t = (texto ?? q).trim()
    if (t.length < 2) { showToast('Escribe qué necesitas (al menos 2 letras)', 'error'); return }
    setQ(t)
    buscar({ tipo: 'buscar', q: t })
  }
  // Si hay versión nueva, el motor devuelve una revisión: se muestra igual que una skill nueva
  const actualizarSkill = (s) => pedirAccion({ tipo: 'actualizar', nombre: s.nombre })
  const revAbierta = revActualizacion || revision

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 0 }}>
          Busca skills en <a href="https://skills.sh" target="_blank" rel="noopener noreferrer">skills.sh</a> o pega el link de un repo de GitHub.
          El motor de tu PC las descarga a una cuarentena, te muestra qué traen y <strong>solo las instala cuando tú lo apruebas</strong>.
          Después las asignas a cada agente en <em>Editar agente → Skills</em>.
        </p>
        {!online && (
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-2)', color: 'var(--danger)', fontSize: 12.5, marginBottom: 12 }}>
            El motor está apagado: enciéndelo para buscar e instalar (motor/iniciar-agentes).
          </div>
        )}
        <form onSubmit={e => { e.preventDefault(); lanzarBusqueda() }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="form-input" style={{ flex: 1, minWidth: 200 }} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Ej. copywriting, video, seo… o github.com/dueño/repo" />
          <button className="btn btn-primary" type="submit" disabled={ocupado(busqueda)}>
            {ocupado(busqueda) ? 'Buscando…' : 'Buscar'}
          </button>
        </form>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {SUGERENCIAS.map(s => (
            <button key={s} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => lanzarBusqueda(s)}>{s}</button>
          ))}
        </div>

        {busqueda?.estado === 'error' && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{busqueda.error}</p>}
        {busqueda?.estado === 'listo' && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 8px' }}>
              {busqueda.resultado.modo === 'repo'
                ? `${busqueda.resultado.skills.length} skills en ${busqueda.resultado.repo}`
                : `${busqueda.resultado.skills.length} resultados · primero las fuentes confiables; las instalaciones solo miden popularidad, no seguridad`}
            </p>
            {busqueda.resultado.skills.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Sin resultados.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {busqueda.resultado.skills.map(s => (
                <div key={s.source + '/' + (s.ruta || s.skillId)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <strong style={{ fontSize: 13.5 }}>{s.name}</strong>{' '}
                    <span className="badge" style={{ fontSize: 10.5, background: s.confiable ? 'var(--success)' : 'var(--card-2)', color: s.confiable ? '#fff' : 'var(--text-2)' }}>
                      {s.confiable ? 'Fuente confiable' : 'Fuente desconocida'}
                    </span>
                    {s.instalada && <span className="badge" style={{ fontSize: 10.5, marginLeft: 4 }}>Instalada</span>}
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">{s.source}</a>
                      {s.installs ? ` · ${s.installs.toLocaleString('es')} instalaciones` : ''}
                      {s.descripcion ? ` · ${s.descripcion}` : ''}
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" disabled={!online || ocupado(revision)}
                    onClick={() => revisar({ tipo: 'revisar', source: s.source, skillId: s.skillId, ruta: s.ruta || '' })}>
                    Revisar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>Instaladas en el motor ({(worker?.skills || []).length})</strong>
          <input className="form-input" style={{ maxWidth: 220, marginLeft: 'auto' }} value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar…" />
        </div>
        {instaladas.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{online ? 'Ninguna.' : 'Enciende el motor para ver la lista.'}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {instaladas.map(s => (
            <div key={s.nombre} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <strong style={{ fontSize: 13 }}>{s.nombre}</strong>
                {s.estadoUso === 'inactiva' && <span className="badge" style={{ fontSize: 10.5, marginLeft: 6 }} title="El curador la archivará si sigue sin uso">Inactiva</span>}
                {s.ubicacion !== 'usuario' && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>
                    {s.usos ? `${s.usos} uso${s.usos === 1 ? '' : 's'} · último ${String(s.ultimoUso).slice(0, 10)}` : 'sin usos registrados'}
                  </span>
                )}
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  {s.repo ? `${s.repo} @${s.commit?.slice(0, 7)}${s.instalada ? ` · ${s.instalada}` : ''}` : s.ubicacion === 'usuario' ? 'Instalada a mano en el PC (~/.claude/skills)' : 'Sin origen registrado'}
                  {s.descripcion ? ` · ${s.descripcion.slice(0, 140)}` : ''}
                </div>
              </div>
              {s.ubicacion !== 'usuario' && (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => fijar(s.nombre)} title="Fijada: el curador nunca la archiva"
                    style={{ color: fijadas.includes(s.nombre) ? 'var(--purple)' : 'var(--text-3)' }}>
                    {fijadas.includes(s.nombre) ? '📌 Fijada' : 'Fijar'}
                  </button>
                  <button className="btn btn-secondary btn-sm" disabled={!online || !s.repo || ocupado(accion)} onClick={() => actualizarSkill(s)}
                    title={s.repo ? 'Comparar con la última versión del repo' : 'Sin origen: reinstálala desde el buscador'}>
                    Buscar actualización
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} disabled={!online || ocupado(accion)}
                    onClick={() => { if (confirm(`¿Quitar la skill "${s.nombre}" del motor? Los agentes que la usen dejarán de tenerla.`)) pedirAccion({ tipo: 'desinstalar', nombre: s.nombre }) }}>
                    <Icon name="trash" size={12} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <CuradorCard worker={worker} online={online} cfg={curadorCfg} accion={accion} pedirAccion={pedirAccion} />

      {revAbierta && (
        <RevisionModal op={revAbierta} instalando={ocupado(accion) && accion?.tipo === 'instalar'}
          onClose={() => { cerrarRevision(); setRevActualizacion(null) }}
          onInstalar={() => pedirAccion({ tipo: 'instalar', revisionId: revAbierta.id, reemplazar: revAbierta.tipo === 'actualizar' || !!revAbierta.resultado?.yaInstalada })} />
      )}
    </div>
  )
}

function RevisionModal({ op, instalando, onClose, onInstalar }) {
  const r = op.resultado || {}
  const altos = (r.avisos || []).filter(a => a.nivel !== 'info')
  const [verMd, setVerMd] = useState(false)
  const [acepto, setAcepto] = useState(false)
  const necesitaAceptar = !r.confiable || altos.length > 0
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h2 className="modal-title">{op.tipo === 'actualizar' ? 'Actualización de skill' : 'Revisión de skill'}</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        {ocupado(op) && <p style={{ fontSize: 13 }}><span className="spinner" /> El motor está descargando y revisando la skill…</p>}
        {op.estado === 'error' && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{op.error}</p>}
        {op.estado === 'listo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
            <div>
              <strong style={{ fontSize: 15 }}>{r.nombre}</strong>{' '}
              <span className="badge" style={{ background: r.confiable ? 'var(--success)' : 'var(--danger)', color: '#fff', fontSize: 10.5 }}>
                {r.confiable ? 'Fuente confiable' : 'Fuente desconocida'}
              </span>
              <div style={{ color: 'var(--text-3)', fontSize: 12 }}>
                <a href={`https://github.com/${r.source}/tree/${r.commit}/${r.ruta}`} target="_blank" rel="noopener noreferrer">{r.source}/{r.ruta}</a>
                {' · '}commit {r.commit?.slice(0, 7)}{op.resultado?.commitAnterior ? ` (instalada: ${op.resultado.commitAnterior.slice(0, 7)})` : ''}
              </div>
              <p style={{ margin: '6px 0 0', color: 'var(--text-2)' }}>{r.descripcion}</p>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', color: 'var(--text-2)', fontSize: 12.5 }}>
              <span>{r.archivos} archivos</span>
              <span>{(r.bytes / 1024 / 1024).toFixed(1)} MB</span>
              <span>{r.totalScripts} scripts</span>
              {r.binarios?.length > 0 && <span style={{ color: 'var(--danger)' }}>{r.binarios.length} binarios</span>}
            </div>
            {(r.avisos || []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {r.avisos.map(a => (
                  <div key={a.mensaje} style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--bg-2)', borderLeft: `3px solid ${a.nivel === 'info' ? 'var(--info, #2563eb)' : 'var(--danger)'}` }}>
                    {a.mensaje}
                    {a.en?.length > 0 && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.en.join(', ')}</div>}
                  </div>
                ))}
              </div>
            ) : <p style={{ color: 'var(--success)', margin: 0 }}>No encontré patrones de riesgo.</p>}
            {r.totalScripts > 0 && (
              <details>
                <summary style={{ cursor: 'pointer' }}>Scripts ({r.totalScripts}) y servidores a los que se conectan ({r.hosts?.length || 0})</summary>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>{r.scripts?.join(', ')}</div>
                {r.hosts?.length > 0 && <div style={{ fontSize: 11.5, marginTop: 6 }}>Servidores: {r.hosts.join(', ')}</div>}
              </details>
            )}
            <div>
              <button className="btn btn-ghost btn-sm" onClick={() => setVerMd(v => !v)}>{verMd ? 'Ocultar' : 'Ver'} SKILL.md (las instrucciones que leerá el agente)</button>
              {verMd && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, maxHeight: 280, overflow: 'auto', background: 'var(--bg-2)', padding: 10, borderRadius: 8 }}>{r.skillMd}</pre>}
            </div>
            {r.yaInstalada && op.tipo !== 'actualizar' && <p style={{ margin: 0, color: 'var(--text-2)' }}>Ya hay una skill con este nombre: se reemplazará.</p>}
            {necesitaAceptar && r.instalable && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5 }}>
                <input type="checkbox" checked={acepto} onChange={e => setAcepto(e.target.checked)} />
                Revisé lo anterior y confío en esta skill. Los agentes podrán ejecutar sus scripts en el PC del motor.
              </label>
            )}
          </div>
        )}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onInstalar}
            disabled={op.estado !== 'listo' || !r.instalable || instalando || (necesitaAceptar && !acepto)}>
            {instalando ? 'Instalando…' : op.tipo === 'actualizar' ? 'Actualizar' : 'Instalar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Curador de skills (B3): una vez por semana, con el motor libre 2 h, marca inactivas las skills sin uso
// y archiva (mueve, no borra) las que llevan muchos días sin uso. Ajustes en config/curador.
function CuradorCard({ worker, online, cfg, accion, pedirAccion }) {
  const { showToast } = useApp()
  const c = worker?.curador || {}
  const [form, setForm] = useState(null)
  const valores = form || {
    activo: (cfg.activo ?? c.activo) !== false, simular: (cfg.simular ?? c.simular) !== false,
    diasInactiva: String(cfg.diasInactiva ?? c.diasInactiva ?? 14), diasArchivo: String(cfg.diasArchivo ?? c.diasArchivo ?? 30),
  }
  const set = (k, v) => setForm({ ...valores, [k]: v })
  const guardar = async () => {
    const di = Number(valores.diasInactiva), da = Number(valores.diasArchivo)
    if (!Number.isInteger(di) || !Number.isInteger(da) || di < 1 || da <= di) { showToast('Los días deben ser enteros y archivar debe ser mayor que inactivar', 'error'); return }
    try {
      await setDoc(doc(db, 'config', 'curador'), { activo: valores.activo, simular: valores.simular, diasInactiva: di, diasArchivo: da, updatedAt: serverTimestamp() }, { merge: true })
      setForm(null); showToast('Guardado')
    } catch (e) { console.error(e); showToast('No se pudo guardar', 'error') }
  }
  const archivadas = c.archivadas || []
  const curando = ocupado(accion) && accion?.tipo === 'curar'
  return (
    <div className="card">
      <strong style={{ fontSize: 14 }}>🧹 Curador de skills</strong>
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '6px 0 12px' }}>
        Cada semana, cuando el motor lleva 2 horas sin tareas, revisa cuánto se usa cada skill. Sin uso por un tiempo
        pasa a <em>inactiva</em> (solo un aviso); si sigue sin uso, se <strong>archiva</strong>: deja de cargarse pero no se
        borra y la puedes restaurar. Nunca toca las fijadas, las asignadas a un agente ni las de clientes con rutinas.
        Antes de archivar guarda una copia en motor/logs/respaldos-skills.
      </p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
        <label><input type="checkbox" checked={valores.activo} onChange={e => set('activo', e.target.checked)} /> Activo</label>
        <label title="Solo informa por Telegram y aquí, sin mover nada"><input type="checkbox" checked={valores.simular} onChange={e => set('simular', e.target.checked)} /> Solo simular</label>
        <label>Inactiva a los <input className="form-input" style={{ width: 60, display: 'inline-block' }} value={valores.diasInactiva} onChange={e => set('diasInactiva', e.target.value)} /> días</label>
        <label>Archiva a los <input className="form-input" style={{ width: 60, display: 'inline-block' }} value={valores.diasArchivo} onChange={e => set('diasArchivo', e.target.value)} /> días</label>
        {form && <button className="btn btn-primary btn-sm" onClick={guardar}>Guardar</button>}
        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} disabled={!online || ocupado(accion)} onClick={() => pedirAccion({ tipo: 'curar', simular: true })}>
          {curando ? 'Revisando…' : 'Simular ahora'}
        </button>
      </div>
      {(accion?.tipo === 'curar' && accion?.estado === 'listo' ? accion.resultado?.texto : c.ultimoInforme?.texto) && (
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: 'var(--bg-2)', padding: 10, borderRadius: 8, marginTop: 12 }}>
          {accion?.tipo === 'curar' && accion?.estado === 'listo' ? accion.resultado.texto : `${c.ultimoInforme.texto}\n\n(${String(c.ultimoInforme.fecha).slice(0, 16).replace('T', ' ')})`}
        </pre>
      )}
      {archivadas.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Archivadas ({archivadas.length})</div>
          {archivadas.map(a => (
            <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 12px', background: 'var(--bg-2)', borderRadius: 8, marginBottom: 4, fontSize: 12.5 }}>
              <span style={{ flex: 1 }}>{a.nombre}{a.alcance === 'cliente' ? ' (de un cliente)' : ''} · {String(a.fecha).slice(0, 10)}</span>
              <button className="btn btn-ghost btn-sm" disabled={!online || ocupado(accion)} onClick={() => pedirAccion({ tipo: 'restaurar', archivoId: a.id })}>Restaurar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
