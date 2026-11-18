import React, { useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { db } from '../firebase.js'
import { doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { toLines, fromLines } from '../agencia.js'
import { LIMITES_PLAN } from '../../../motor/consumo.mjs'
import MedidorClaude from '../components/MedidorClaude.jsx'
import MemoriaEditor from '../components/MemoriaEditor.jsx'
import CATALOGO from '../../../roles/catalogo.json'
import { addDoc, collection } from 'firebase/firestore'

// Configuración del motor desde el panel.
// - Ajustes (config/motor): el motor los aplica al momento; lo que quede vacío sale de motor/negocio.json.
// - Claves (secretos/{nombre}): el admin las escribe, solo el motor las lee; el panel nunca las vuelve a mostrar.
//   El motor publica en config/agentWorker → secretos si cada clave viene del panel, de motor/.env o falta.

const MOTORES = [
  { id: 'claude', nombre: 'Claude Code' },
  { id: 'antigravity', nombre: 'Antigravity' },
  { id: 'codex', nombre: 'Codex' },
  { id: 'gemini', nombre: 'Gemini CLI' },
]
const CUPOS = [...MOTORES, { id: 'api', nombre: 'Modelos por API' }]

export const SECRETOS_MOTOR = [
  { id: 'TELEGRAM_BOT_TOKEN', nombre: 'Token del bot de Telegram', ayuda: 'Créalo con @BotFather en Telegram. El coordinador te responde y te avisa por ahí.' },
  { id: 'GEMINI_API_KEY', nombre: 'Clave de Gemini (Google AI Studio)', ayuda: 'Para el motor Gemini CLI. Sácala en aistudio.google.com → Get API key.' },
  { id: 'ANTHROPIC_API_KEY', nombre: 'Clave de API de Anthropic', ayuda: 'Solo si el plan de Claude es "Clave de API" (console.anthropic.com). Con Pro o Max el motor la ignora para no cobrarte por API.' },
  { id: 'PAGESPEED_API_KEY', nombre: 'Clave de PageSpeed Insights', ayuda: 'Para el agente de SEO técnico. Es gratis: console.cloud.google.com → APIs → PageSpeed Insights API → Credenciales. Sin clave funciona con un cupo muy bajo.' },
  { id: 'WHATSAPP_TOKEN', nombre: 'Token de WhatsApp (Meta)', ayuda: 'Token permanente de un usuario del sistema (Meta Business → Usuarios del sistema) con permiso whatsapp_business_messaging.' },
  { id: 'WHATSAPP_APP_SECRET', nombre: 'App secret de Meta', ayuda: 'Meta for Developers → tu app → Configuración → Básica. El motor lo usa para comprobar que cada mensaje viene de Meta.' },
  { id: 'CLOUDFLARE_TUNNEL_TOKEN', nombre: 'Token del túnel de Cloudflare (opcional)', ayuda: 'Para una URL fija: Cloudflare → Zero Trust → Networks → Tunnels → crear túnel → token. Apunta el hostname a http://localhost:<puerto>.' },
  { id: 'LISTMONK_API', nombre: 'Usuario de API de Listmonk', ayuda: 'usuario_api:token (Listmonk → Usuarios → nuevo usuario de tipo API). Los agentes solo crean borradores.' },
  { id: 'GOOGLE_ADS_CRED', nombre: 'Google Ads de la agencia (MCC)', ayuda: 'JSON {"developer_token","client_id","client_secret","refresh_token","login_customer_id"} de tu cuenta de administrador. Solo lectura: los agentes no cambian campañas.' },
  { id: 'META_ADS_TOKEN', nombre: 'Token de Meta Ads de la agencia', ayuda: 'Token de un usuario del sistema del Business Manager con permiso ads_read sobre las cuentas de tus clientes.' },
  { id: 'GOOGLE_ANALITICA_SA', nombre: 'Cuenta de servicio de Google (analítica de la agencia)', ayuda: 'JSON de una cuenta de servicio (Google Cloud → IAM → Cuentas de servicio → Claves). Cada cliente le da acceso de Lector en GA4 y en Search Console. Un cliente también puede tener la suya en su ficha.' },
]
const PLANES = [
  { id: 'pro', nombre: 'Claude Pro' },
  { id: 'max', nombre: 'Claude Max' },
  { id: 'api', nombre: 'Clave de API (pago por uso)' },
]

const desde = (c = {}, e = {}) => ({
  paralelo: Object.fromEntries(CUPOS.map(m => [m.id, String(c.paralelo?.[m.id] ?? e.paralelo?.[m.id] ?? '')])),
  respaldo: (c.respaldo?.length ? c.respaldo : e.respaldo?.length ? e.respaldo : MOTORES.map(m => m.id)).filter(id => MOTORES.some(m => m.id === id)),
  esperaDepartamentoMin: String(c.esperaDepartamentoMin ?? e.esperaDepartamentoMin ?? 30),
  zonaHoraria: c.zonaHoraria || e.zonaHoraria || '',
  modeloAntigravity: c.modeloAntigravity ?? e.modeloAntigravity ?? '',
  geminiDePago: !!(c.geminiDePago ?? e.geminiDePago),
  telegramOwnerId: c.telegramOwnerId || e.telegramOwnerId || '',
  fuentesSkills: toLines(c.fuentesSkills?.length ? c.fuentesSkills : e.fuentesSkills),
  planClaude: c.planClaude || e.planClaude || 'pro',
  tareas5h: String(c.limitesClaude?.tareas5h ?? ''),
  tareasSemana: String(c.limitesClaude?.tareasSemana ?? ''),
  programadasPrimeroOtros: (c.programadasPrimeroOtros ?? e.programadasPrimeroOtros) !== false,
  aprActivo: (c.aprendizaje?.activo ?? e.aprendizaje?.activo) !== false,
  aprMinTurnos: String(c.aprendizaje?.minTurnos ?? e.aprendizaje?.minTurnos ?? 12),
  aprConClaude: !!(c.aprendizaje?.conClaude ?? e.aprendizaje?.conClaude),
  aprProveedorId: c.aprendizaje?.proveedorId ?? e.aprendizaje?.proveedorId ?? '',
  aprModelo: c.aprendizaje?.modelo ?? e.aprendizaje?.modelo ?? '',
  waActivo: c.whatsapp?.activo === true,
  waPhoneNumberId: c.whatsapp?.phoneNumberId || '',
  waPuerto: String(c.whatsapp?.puerto || 8790),
  waUrlFija: c.whatsapp?.urlFija || '',
  listmonkUrl: c.email?.listmonkUrl || '',
  alertasActivo: c.alertas?.activo === true,
})

export default function AgenciaMotor() {
  const { showToast, providers } = useApp()
  const [worker, setWorker] = useState(undefined)
  const [panel, setPanel] = useState(undefined)
  const [form, setForm] = useState(null)
  const [claves, setClaves] = useState({})
  const [guardando, setGuardando] = useState(false)

  useEffect(() => onSnapshot(doc(db, 'config', 'agentWorker'), d => setWorker(d.data() || {}), () => setWorker({})), [])
  useEffect(() => onSnapshot(doc(db, 'config', 'motor'), d => setPanel(d.data() || {}), () => setPanel({})), [])
  const [perfil, setPerfil] = useState([])
  useEffect(() => onSnapshot(doc(db, 'config', 'perfilDueno'), d => setPerfil(d.data()?.entradas || []), () => {}), [])
  const guardarPerfil = (entradas) => {
    setPerfil(entradas)
    setDoc(doc(db, 'config', 'perfilDueno'), { entradas, updatedAt: serverTimestamp() })
      .then(() => showToast('Perfil guardado'), () => showToast('No se pudo guardar el perfil', 'error'))
  }
  // El formulario se llena una vez, cuando ya llegaron los ajustes del panel y los que usa el motor
  useEffect(() => {
    if (form || panel === undefined || worker === undefined) return
    setForm(desde(panel, worker?.ajustesEfectivos))
  }, [panel, worker, form])

  if (!form) return <div className="card"><p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Cargando la configuración del motor…</p></div>

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const mover = (i, d) => setForm(f => {
    const r = [...f.respaldo]; const j = i + d
    if (j < 0 || j >= r.length) return f
    ;[r[i], r[j]] = [r[j], r[i]]
    return { ...f, respaldo: r }
  })

  const guardar = async () => {
    const paralelo = {}
    for (const m of CUPOS) {
      const v = form.paralelo[m.id]
      if (v === '') continue
      const n = Number(v)
      if (!Number.isInteger(n) || n < 1 || n > 10) { showToast(`Tareas en paralelo de ${m.nombre}: un número de 1 a 10`, 'error'); return }
      paralelo[m.id] = n
    }
    const espera = Number(form.esperaDepartamentoMin)
    if (!Number.isFinite(espera) || espera < 0) { showToast('La espera de departamento debe ser un número de minutos', 'error'); return }
    if (form.telegramOwnerId && !/^-?\d+$/.test(form.telegramOwnerId.trim())) { showToast('Tu ID de Telegram es un número', 'error'); return }
    const limitesClaude = {}
    for (const k of ['tareas5h', 'tareasSemana']) {
      if (form[k] === '') continue
      const n = Number(form[k])
      if (!Number.isInteger(n) || n < 1) { showToast('Los umbrales de Claude son números enteros mayores que 0 (o vacío para el valor del plan)', 'error'); return }
      limitesClaude[k] = n
    }
    const waPuerto = Number(form.waPuerto)
    if (!Number.isInteger(waPuerto) || waPuerto < 1024 || waPuerto > 65535) { showToast('El puerto de WhatsApp va de 1024 a 65535', 'error'); return }
    if (form.waPhoneNumberId && !/^\d{6,20}$/.test(form.waPhoneNumberId.trim())) { showToast('El Phone number ID de WhatsApp son solo números (Meta → WhatsApp → Configuración de la API)', 'error'); return }
    if (form.listmonkUrl.trim() && !/^https?:\/\/\S+$/.test(form.listmonkUrl.trim())) { showToast('La URL de Listmonk empieza por http:// o https://', 'error'); return }
    const minTurnos = Number(form.aprMinTurnos)
    if (!Number.isInteger(minTurnos) || minTurnos < 1) { showToast('Pasos mínimos para aprender: un número entero mayor que 0', 'error'); return }
    setGuardando(true)
    try {
      await setDoc(doc(db, 'config', 'motor'), {
        aprendizaje: { activo: form.aprActivo, minTurnos, conClaude: form.aprConClaude, proveedorId: form.aprProveedorId, modelo: form.aprModelo.trim() },
        email: { listmonkUrl: form.listmonkUrl.trim().replace(/\/+$/, '') },
        alertas: { activo: form.alertasActivo },
        whatsapp: { ...(panel?.whatsapp || {}), activo: form.waActivo, phoneNumberId: form.waPhoneNumberId.trim(), puerto: waPuerto, urlFija: form.waUrlFija.trim() },
        paralelo, respaldo: form.respaldo, esperaDepartamentoMin: espera,
        zonaHoraria: form.zonaHoraria.trim(), modeloAntigravity: form.modeloAntigravity.trim(), geminiDePago: form.geminiDePago,
        telegramOwnerId: form.telegramOwnerId.trim(), fuentesSkills: fromLines(form.fuentesSkills),
        planClaude: form.planClaude, limitesClaude, programadasPrimeroOtros: form.programadasPrimeroOtros,
        updatedAt: serverTimestamp(),
      })
      showToast('Guardado. El motor lo aplica al momento')
    } catch (e) {
      console.error(e)
      showToast('No se pudo guardar', 'error')
    } finally { setGuardando(false) }
  }

  const guardarClave = async (id) => {
    const valor = (claves[id] || '').trim()
    if (!valor) return
    try {
      await setDoc(doc(db, 'secretos', id), { valor, updatedAt: serverTimestamp() })
      setClaves(c => ({ ...c, [id]: '' }))
      showToast('Clave guardada. El motor la usa al momento')
    } catch (e) {
      console.error(e)
      showToast(e.code === 'permission-denied' ? 'Sin permiso: publica las reglas de Firestore' : 'No se pudo guardar la clave', 'error')
    }
  }
  const quitarClave = async (s) => {
    if (!confirm(`¿Quitar "${s.nombre}" del panel? Si existe en motor/.env, el motor vuelve a usar esa.`)) return
    await deleteDoc(doc(db, 'secretos', s.id)).then(() => showToast('Clave quitada'), () => showToast('No se pudo quitar', 'error'))
  }

  const origen = worker?.secretos || {}
  const motorEncendido = !!worker?.online
  const estadoClave = (id) => {
    const o = origen[id]
    if (o === 'panel') return <span style={{ color: 'var(--success)' }}>Guardada en el panel ✓</span>
    if (o === 'env') return <span style={{ color: 'var(--text-2)' }}>Viene de motor/.env</span>
    if (!motorEncendido && !worker?.secretos) return <span style={{ color: 'var(--text-3)' }}>Enciende el motor para ver el estado</span>
    return <span style={{ color: 'var(--danger)' }}>Falta</span>
  }
  const fila = { display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 10, flexWrap: 'wrap' }
  const nota = { fontSize: 12, color: 'var(--text-3)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Claves</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 0 }}>
          Quedan guardadas en tu Firebase y <strong>nadie puede volver a leerlas desde el panel</strong>: solo el motor de tu PC.
          Una clave del panel reemplaza a la de <code>motor/.env</code>.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SECRETOS_MOTOR.map(s => (
            <div key={s.id} style={fila}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <strong style={{ fontSize: 14 }}>{s.nombre}</strong>
                <div style={{ fontSize: 12 }}>{estadoClave(s.id)}</div>
                <div style={nota}>{s.ayuda}</div>
              </div>
              <input className="form-input" type="password" autoComplete="off" style={{ flex: 1, minWidth: 200 }}
                value={claves[s.id] || ''} onChange={e => setClaves(c => ({ ...c, [s.id]: e.target.value }))}
                placeholder={origen[s.id] === 'panel' ? 'Escribe una nueva solo para reemplazarla' : 'Pega aquí la clave'} />
              <button className="btn btn-primary btn-sm" disabled={!(claves[s.id] || '').trim()} onClick={() => guardarClave(s.id)}>Guardar</button>
              {origen[s.id] === 'panel' && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => quitarClave(s)}>Quitar</button>}
            </div>
          ))}
        </div>
        <p style={{ ...nota, marginBottom: 0, marginTop: 12 }}>
          Las claves de los modelos por API se cargan en <em>Modelos de IA</em>. El correo y la contraseña del robot siguen en <code>motor/.env</code>:
          el motor los necesita para entrar a Firebase y leer todo lo demás. Las sesiones de Claude Code, Antigravity y Codex se inician en el PC del motor.
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Tu perfil (lo que todos los agentes saben de ti)</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 0 }}>
          Tus preferencias como quien aprueba: estilo, cosas que siempre pides o que nunca quieres ver. Va en cada tarea de todos los agentes.
        </p>
        <MemoriaEditor tipo="dueno" entradas={perfil} onChange={guardarPerfil} vacio="Aún no hay nada. Ejemplo: «Prefiero textos cortos, sin signos de exclamación.»" />
      </div>

      <PermisosSiempre />

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Alertas de caída (Uptime Kuma)</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 0 }}>
          Uptime Kuma vigila los sitios de tus clientes. Cuando uno cae, el motor te avisa por Telegram y crea una tarea urgente
          para el agente con rol <em>DevOps y soporte</em>, que diagnostica desde afuera y propone el arreglo. Usa el mismo
          puerto y túnel que WhatsApp.
        </p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={form.alertasActivo} onChange={e => set('alertasActivo', e.target.checked)} /> Recibir alertas
        </label>
        {worker?.alertas?.activo && (
          <div style={{ fontSize: 12.5, padding: 10, background: 'var(--bg-2)', borderRadius: 8, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>En Uptime Kuma → Notificaciones → <strong>Webhook</strong> (POST, JSON) pega:</span>
            {worker.alertas.urlPublica && <code style={{ wordBreak: 'break-all' }}>{worker.alertas.urlPublica}</code>}
            <code style={{ wordBreak: 'break-all' }}>{worker.alertas.urlLocal}</code>
            <span style={nota}>La local sirve si Kuma corre en este mismo PC; la pública (túnel) si corre en otro lado. Incidentes abiertos: {worker.alertas.abiertas}.</span>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Email (Listmonk)</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 0 }}>
          El agente de email marketing deja las campañas en <strong>borrador</strong> en tu Listmonk; tú las envías desde allí.
          Cada cliente solo usa las listas que le asignes en su ficha (pestaña Email).
        </p>
        <div className="form-group">
          <label className="form-label">URL de Listmonk</label>
          <input className="form-input" value={form.listmonkUrl} onChange={e => set('listmonkUrl', e.target.value)} placeholder="https://correo.tuagencia.com" />
          <span style={nota}>El usuario de API va abajo en Claves.</span>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>WhatsApp Business</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 0 }}>
          El motor recibe los mensajes de WhatsApp (Cloud API de Meta) por un túnel de Cloudflare. Los números nuevos reciben
          un código y tú decides en <em>Agencia → WhatsApp</em> si son el dueño (habla con el coordinador) o un cliente (su
          mensaje queda en la bandeja y respondes tú). Claves: token y app secret de Meta, abajo en Claves.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={form.waActivo} onChange={e => set('waActivo', e.target.checked)} /> Activar WhatsApp
          </label>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Phone number ID</label>
              <input className="form-input" value={form.waPhoneNumberId} onChange={e => set('waPhoneNumberId', e.target.value)} placeholder="Meta → WhatsApp → Configuración de la API" />
            </div>
            <div className="form-group">
              <label className="form-label">Puerto local del webhook</label>
              <input className="form-input" type="number" value={form.waPuerto} onChange={e => set('waPuerto', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">URL fija del túnel (solo con túnel de Cloudflare con token)</label>
            <input className="form-input" value={form.waUrlFija} onChange={e => set('waUrlFija', e.target.value)} placeholder="https://whatsapp.tudominio.com" />
            <span style={nota}>Sin token de túnel se usa uno rápido (trycloudflare.com) cuya URL cambia en cada encendido: sirve para probar.</span>
          </div>
          {worker?.whatsapp?.activo && (
            <div style={{ fontSize: 12.5, padding: 10, background: 'var(--bg-2)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {worker.whatsapp.faltan?.length ? <span style={{ color: 'var(--danger)' }}>Falta: {worker.whatsapp.faltan.join(', ')}</span> : null}
              <span>Túnel: {worker.whatsapp.tunel ? `${worker.whatsapp.tunel.estado}${worker.whatsapp.tunel.cloudflared ? '' : ' (instala cloudflared en el PC del motor)'}` : 'apagado'}</span>
              {worker.whatsapp.tunel?.url && <span>URL del webhook para Meta: <code>{worker.whatsapp.tunel.url}</code></span>}
              {worker.whatsapp.tokenVerificacion && <span>Token de verificación para Meta: <code>{worker.whatsapp.tokenVerificacion}</code></span>}
              <span style={nota}>En Meta → WhatsApp → Configuración: pega la URL y el token, y suscríbete al campo "messages".</span>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Aprendizaje propuesto</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 0 }}>
          Al aprobar una tarea con correcciones, rechazo, observaciones del revisor o muchos pasos, un modelo sin herramientas
          propone qué guardar en la memoria o qué convertir en skill. Tú lo apruebas en el Pipeline.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={form.aprActivo} onChange={e => set('aprActivo', e.target.checked)} />
            Proponer aprendizajes al aprobar tareas
          </label>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Modelo por API (opcional)</label>
              <select className="form-select" value={form.aprProveedorId} onChange={e => set('aprProveedorId', e.target.value)}>
                <option value="">Ninguno: usar Antigravity, Codex o Gemini</option>
                {providers.filter(p => p.activo !== false).map(p => <option key={p.id} value={p.id}>{p.nombre}{p.gratis ? ' (gratis)' : ''}</option>)}
              </select>
              {form.aprProveedorId && <input className="form-input" style={{ marginTop: 6 }} value={form.aprModelo} onChange={e => set('aprModelo', e.target.value)} placeholder="Modelo (vacío = el primero del proveedor)" />}
              <span style={nota}>Un modelo barato basta. Los proveedores gratis solo se usan con clientes que lo permiten.</span>
            </div>
            <div className="form-group">
              <label className="form-label">Revisar también tareas sin correcciones con al menos N pasos</label>
              <input className="form-input" type="number" min={1} value={form.aprMinTurnos} onChange={e => set('aprMinTurnos', e.target.value)} />
            </div>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={form.aprConClaude} onChange={e => set('aprConClaude', e.target.checked)} />
            Si no hay otro motor, usar Claude (gasta de tu plan)
          </label>
          <OptimizarRol />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Plan de Claude y consumo</h3>
        <MedidorClaude c={worker?.consumoClaude} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Plan con el que corre Claude Code</label>
              <select className="form-select" value={form.planClaude} onChange={e => set('planClaude', e.target.value)}>
                {PLANES.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <span style={nota}>Si cambias de plan, solo cambia este valor (y pega la clave arriba si es "Clave de API").</span>
            </div>
            {form.planClaude !== 'api' && (
              <div className="form-group">
                <label className="form-label">Umbral: corridas de Claude en 5 h / en 7 días</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="form-input" type="number" min={1} value={form.tareas5h} onChange={e => set('tareas5h', e.target.value)} placeholder={String(LIMITES_PLAN[form.planClaude]?.tareas5h ?? '')} />
                  <input className="form-input" type="number" min={1} value={form.tareasSemana} onChange={e => set('tareasSemana', e.target.value)} placeholder={String(LIMITES_PLAN[form.planClaude]?.tareasSemana ?? '')} />
                </div>
                <span style={nota}>Al llegar al umbral, las tareas que pueden hacerse sin Claude van primero a los otros motores. Vacío = valor sugerido del plan (estimado: ajústalo según tu experiencia).</span>
              </div>
            )}
          </div>
          {form.planClaude === 'pro' && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={form.programadasPrimeroOtros} onChange={e => set('programadasPrimeroOtros', e.target.checked)} />
              Las tareas programadas (desatendidas) usan primero Antigravity, Codex o Gemini y dejan Claude para tu trabajo
            </label>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Motores de IA</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label className="form-label">Tareas en paralelo por motor</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {CUPOS.map(m => (
                <div key={m.id} className="form-group" style={{ width: 130 }}>
                  <span style={nota}>{m.nombre}</span>
                  <input className="form-input" type="number" min={1} max={10} value={form.paralelo[m.id]}
                    onChange={e => set('paralelo', { ...form.paralelo, [m.id]: e.target.value })} />
                </div>
              ))}
            </div>
            <span style={nota}>Cada agente hace una tarea a la vez. Más tareas en paralelo gastan más rápido el límite de cada plan.</span>
          </div>

          <div>
            <label className="form-label">Orden de respaldo</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 360 }}>
              {form.respaldo.map((id, i) => (
                <div key={id} style={{ ...fila, padding: '6px 12px' }}>
                  <span style={{ width: 18, color: 'var(--text-3)' }}>{i + 1}.</span>
                  <span style={{ flex: 1 }}>{MOTORES.find(m => m.id === id)?.nombre || id}</span>
                  <span style={{ fontSize: 11, color: worker?.motores?.[id]?.conectado || id === 'claude' ? 'var(--success)' : 'var(--text-3)' }}>
                    {id === 'claude' || worker?.motores?.[id]?.conectado ? 'conectado' : 'sin sesión'}
                  </span>
                  <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
                  <button className="btn btn-ghost btn-sm" disabled={i === form.respaldo.length - 1} onClick={() => mover(i, 1)} aria-label="Bajar">↓</button>
                </div>
              ))}
            </div>
            <span style={nota}>Si un motor llega a su límite de uso, la tarea pasa al siguiente conectado que sirva para ella.</span>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Modelo de Antigravity por defecto</label>
              <input className="form-input" value={form.modeloAntigravity} onChange={e => set('modeloAntigravity', e.target.value)} placeholder="Vacío = el que traiga Antigravity" />
              <span style={nota}>Para agentes que caen en Antigravity por respaldo. Cada agente puede elegir el suyo.</span>
            </div>
            <div className="form-group">
              <label className="form-label">Clave de Gemini</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={form.geminiDePago} onChange={e => set('geminiDePago', e.target.checked)} /> Es de pago (con facturación)
              </label>
              <span style={nota}>Sin facturación cuenta como plan gratis: solo recibe tareas internas o de clientes con "Permite modelos gratis".</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Agencia y Telegram</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Espera antes de dar una tarea de departamento a un agente (min)</label>
              <input className="form-input" type="number" min={0} value={form.esperaDepartamentoMin} onChange={e => set('esperaDepartamentoMin', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Zona horaria de las rutinas</label>
              <input className="form-input" value={form.zonaHoraria} onChange={e => set('zonaHoraria', e.target.value)} placeholder="America/Bogota" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Tu ID de Telegram</label>
            <input className="form-input" value={form.telegramOwnerId} onChange={e => set('telegramOwnerId', e.target.value)} placeholder="Número. Si no lo sabes, escríbele al bot y el motor lo muestra en su registro" style={{ maxWidth: 360 }} />
            <span style={nota}>El bot solo le responde a esta persona.</span>
          </div>
          <div className="form-group">
            <label className="form-label">Fuentes de skills confiables (además de las que trae el sistema)</label>
            <textarea className="form-textarea" rows={3} value={form.fuentesSkills} onChange={e => set('fuentesSkills', e.target.value)} placeholder="usuario/repo, una por línea" />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-secondary" onClick={() => setForm(desde(panel, worker?.ajustesEfectivos))}>Deshacer cambios</button>
        <button className="btn btn-primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar ajustes'}</button>
      </div>
    </div>
  )
}

// Acciones aprobadas "siempre" (B4): ya no preguntan. Quitar una hace que vuelva a pedir aprobación.
function PermisosSiempre() {
  const { showToast } = useApp()
  const [siempre, setSiempre] = useState([])
  useEffect(() => onSnapshot(doc(db, 'config', 'permisosAcciones'), d => setSiempre(d.data()?.siempre || []), () => {}), [])
  const quitar = async (tool) => {
    try { await setDoc(doc(db, 'config', 'permisosAcciones'), { siempre: siempre.filter(x => x !== tool), updatedAt: serverTimestamp() }, { merge: true }); showToast('Volverá a pedir aprobación', 'info') }
    catch (e) { console.error(e); showToast('No se pudo quitar', 'error') }
  }
  return (
    <div className="card">
      <h3 style={{ marginTop: 0, fontSize: 15 }}>Acciones con aprobación</h3>
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 0 }}>
        Cuando un agente quiere enviar, publicar o gastar (borradores de Gmail, eventos de calendario, archivos en Drive fuera
        de su carpeta, créditos de Magnific), el motor lo detiene y te pregunta aquí arriba y por Telegram. Sin respuesta en
        5 minutos, se deniega. En tareas programadas se deniega siempre, salvo lo que esté en esta lista.
        La lista de acciones está en <code>roles/catalogo.json → accionesConAprobacion</code>.
      </p>
      {siempre.length === 0
        ? <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Ninguna acción aprobada "siempre": todas preguntan.</p>
        : siempre.map(tool => (
          <div key={tool} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', background: 'var(--bg-2)', borderRadius: 8, marginBottom: 4, fontSize: 12.5 }}>
            <code style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tool}</code>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => quitar(tool)}>Quitar</button>
          </div>
        ))}
    </div>
  )
}

// C7: pedir que se revise ya el historial de un rol (normalmente se hace solo una vez al mes)
function OptimizarRol() {
  const { showToast, agents = [], user } = useApp()
  const [rol, setRol] = useState('')
  const [pedido, setPedido] = useState(null)
  const roles = [...new Set(agents.map(a => a.rol).filter(r => r && CATALOGO.roles[r]))]
  const pedir = async () => {
    try {
      const r = await addDoc(collection(db, 'optimizacionPedidos'), { rolId: rol, estado: 'pendiente', creadoPor: user.email, creadoAt: serverTimestamp() })
      setPedido('pendiente')
      onSnapshot(doc(db, 'optimizacionPedidos', r.id), s => { const d = s.data(); if (!d) return; setPedido(d.estado === 'listo' ? ({ propuesta: 'Listo: hay una propuesta en el Pipeline', sin_datos: 'Aún no hay suficientes tareas corregidas de este rol (mínimo 4)', sin_cambios: 'Revisado: no hay un patrón claro que corregir' }[d.resultado] || 'Listo') : d.estado === 'error' ? `Error: ${d.error}` : d.estado) })
    } catch (e) { console.error(e); showToast('No se pudo pedir', 'error') }
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <span>Mejorar las instrucciones de un rol con su historial (también se hace solo cada mes):</span>
      <select className="form-select" style={{ width: 'auto' }} value={rol} onChange={e => setRol(e.target.value)}>
        <option value="">Elige un rol…</option>
        {roles.map(r => <option key={r} value={r}>{CATALOGO.roles[r].nombre}</option>)}
      </select>
      <button type="button" className="btn btn-secondary btn-sm" disabled={!rol || pedido === 'pendiente' || pedido === 'trabajando'} onClick={pedir}>Revisar ahora</button>
      {pedido && <span style={{ color: 'var(--text-3)' }}>{pedido}</span>}
    </div>
  )
}
