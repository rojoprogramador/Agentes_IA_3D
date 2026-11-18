import React, { useEffect, useState } from 'react'
import MemoriaEditor from './MemoriaEditor.jsx'
import { db } from '../firebase.js'
import { doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import Icon from './Icons.jsx'
import { emptyClient, slugify, toLines, fromLines } from '../agencia.js'

const TABS = [
  { id: 'negocio', label: 'Negocio' },
  { id: 'marca', label: 'Marca' },
  { id: 'objetivos', label: 'Objetivos' },
  { id: 'activos', label: 'Activos' },
  { id: 'analitica', label: 'Analítica y anuncios' },
  { id: 'email', label: 'Email' },
  { id: 'alcance', label: 'Alcance' },
  { id: 'aprendizajes', label: 'Aprendizajes' },
]

// Ficha de contexto de un cliente: es lo que leen los agentes en cada tarea de ese cliente (y de ningún otro)
export default function ClientProfile({ client, departments, onClose, onRenamed, showToast, userEmail }) {
  const base = emptyClient(client?.nombre || '')
  const c = client || {}
  const [tab, setTab] = useState('negocio')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nombre: c.nombre || '',
    activo: c.activo !== false,
    interno: !!c.interno,
    permiteModelosGratis: c.permiteModelosGratis === true,
    departamentos: c.departamentos || [],
    descripcion: c.negocio?.descripcion || '',
    servicios: toLines(c.negocio?.servicios),
    zona: c.negocio?.zona || '',
    publico: c.negocio?.publico || '',
    tono: c.marca?.tono || '',
    colores: (c.marca?.colores || []).join(', '),
    logoUrl: c.marca?.logoUrl || '',
    palabrasSi: toLines(c.marca?.palabrasSi),
    palabrasNo: toLines(c.marca?.palabrasNo),
    objetivos: toLines(c.objetivos),
    web: c.activos?.web || '',
    redes: c.activos?.redes || '',
    repos: toLines(c.activos?.repos),
    driveFolderId: c.activos?.driveFolderId || '',
    bibliotecaPath: c.activos?.bibliotecaPath || '',
    dominios: toLines(c.alcanceAutorizado?.dominios),
    alcanceRepos: toLines(c.alcanceAutorizado?.repos),
    alcanceNotas: c.alcanceAutorizado?.notas || '',
    autorizadoPor: c.alcanceAutorizado?.autorizadoPor || '',
    alcanceFecha: c.alcanceAutorizado?.fecha || '',
    alcanceIps: toLines(c.alcanceAutorizado?.ips),
    subdominios: c.alcanceAutorizado?.subdominios === true,
    cargoFirmante: c.alcanceAutorizado?.cargo || '',
    documento: c.alcanceAutorizado?.documento || '',
    vigenciaDesde: c.alcanceAutorizado?.vigenciaDesde || c.alcanceAutorizado?.fecha || '',
    vigenciaHasta: c.alcanceAutorizado?.vigenciaHasta || '',
    ventanaDias: c.alcanceAutorizado?.ventana?.dias || [],
    ventanaDesde: c.alcanceAutorizado?.ventana?.desde || '',
    ventanaHasta: c.alcanceAutorizado?.ventana?.hasta || '',
    aprendizajes: c.aprendizajes || [],
    ga4PropertyId: c.analitica?.ga4PropertyId || '',
    gscSitio: c.analitica?.gscSitio || '',
    credencialGoogle: '',
    gadsCid: c.ads?.googleAdsCustomerId || '',
    metaCuenta: c.ads?.metaAdAccountId || '',
    topeAds: c.ads?.topeMensual ? String(c.ads.topeMensual) : '',
    credGads: '', tokenMeta: '',
    listasEmail: (c.email?.listas || []).join(', '),
  })
  // Estado de la credencial de Google (lo publica el motor: solo el correo, nunca la clave)
  const [estadoGoogle, setEstadoGoogle] = useState(null)
  useEffect(() => {
    if (tab !== 'analitica') return
    return onSnapshot(doc(db, 'config', 'agentWorker'), d => setEstadoGoogle(d.data()?.analitica || {}), () => setEstadoGoogle({}))
  }, [tab])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const toggleDept = (id) => set('departamentos',
    form.departamentos.includes(id) ? form.departamentos.filter(d => d !== id) : [...form.departamentos, id])


  const handleSave = async () => {
    const nombre = form.nombre.trim()
    if (!nombre) { showToast('El cliente necesita un nombre', 'error'); return }
    const ga4 = form.ga4PropertyId.replace(/^properties\//, '').trim()
    if (ga4 && !/^\d{6,12}$/.test(ga4)) { showToast('El ID de propiedad de GA4 son solo números (Administrar → Detalles de la propiedad), no el G-XXXX', 'error'); return }
    let gsc = form.gscSitio.trim()
    if (gsc && !/^sc-domain:[a-z0-9.-]+\.[a-z]{2,}$/i.test(gsc) && !/^https?:\/\/\S+$/i.test(gsc)) { showToast('Search Console: sc-domain:ejemplo.com o https://www.ejemplo.com/', 'error'); return }
    if (/^https?:/i.test(gsc) && !gsc.endsWith('/')) gsc += '/'
    let credencial = null
    if (form.credencialGoogle.trim()) {
      try { credencial = JSON.parse(form.credencialGoogle) } catch { showToast('La credencial no es un JSON válido', 'error'); return }
      if (credencial.type !== 'service_account' || !credencial.client_email || !/BEGIN PRIVATE KEY/.test(credencial.private_key || '')) { showToast('El JSON debe ser la clave de una cuenta de servicio de Google', 'error'); return }
    }
    const gadsCid = form.gadsCid.replace(/-/g, '').trim()
    if (gadsCid && !/^\d{10}$/.test(gadsCid)) { showToast('El ID de cliente de Google Ads son 10 dígitos (123-456-7890)', 'error'); return }
    const metaCuenta = form.metaCuenta.replace(/^act_/, '').trim()
    if (metaCuenta && !/^\d{5,20}$/.test(metaCuenta)) { showToast('La cuenta de Meta son solo números (act_…)', 'error'); return }
    const topeAds = form.topeAds ? Number(form.topeAds) : 0
    if (!Number.isFinite(topeAds) || topeAds < 0) { showToast('El tope de gasto debe ser un número', 'error'); return }
    let credGads = null
    if (form.credGads.trim()) {
      try { credGads = JSON.parse(form.credGads) } catch { showToast('La credencial de Google Ads no es un JSON válido', 'error'); return }
      if (!['developer_token', 'client_id', 'client_secret', 'refresh_token'].every(k => credGads[k])) { showToast('A la credencial de Google Ads le falta developer_token, client_id, client_secret o refresh_token', 'error'); return }
    }
    if (form.vigenciaDesde && form.vigenciaHasta) {
      const dias = (Date.parse(form.vigenciaHasta) - Date.parse(form.vigenciaDesde)) / 86400000
      if (dias < 0 || dias > 90) { showToast('La vigencia del alcance debe ser de 0 a 90 días (para más, se firma otra autorización)', 'error'); return }
    }
    setSaving(true)
    // Link de Drive o ID: se guarda solo el ID de la carpeta
    const folderId = (form.driveFolderId.match(/folders\/([\w-]+)/)?.[1] || form.driveFolderId).trim()
    const data = {
      ...base, ...c,
      nombre, slug: slugify(nombre), activo: form.activo, interno: form.interno, permiteModelosGratis: form.permiteModelosGratis,
      departamentos: form.departamentos,
      negocio: { descripcion: form.descripcion.trim(), servicios: fromLines(form.servicios), zona: form.zona.trim(), publico: form.publico.trim() },
      marca: {
        tono: form.tono.trim(), logoUrl: form.logoUrl.trim(),
        colores: form.colores.split(',').map(x => x.trim()).filter(Boolean),
        palabrasSi: fromLines(form.palabrasSi), palabrasNo: fromLines(form.palabrasNo),
      },
      objetivos: fromLines(form.objetivos),
      activos: { web: form.web.trim(), redes: form.redes.trim(), repos: fromLines(form.repos), driveFolderId: folderId, bibliotecaPath: form.bibliotecaPath.trim() },
      alcanceAutorizado: {
        dominios: fromLines(form.dominios), repos: fromLines(form.alcanceRepos), notas: form.alcanceNotas.trim(),
        autorizadoPor: form.autorizadoPor.trim(), fecha: form.alcanceFecha,
        ips: fromLines(form.alcanceIps), subdominios: form.subdominios, cargo: form.cargoFirmante.trim(), documento: form.documento.trim(),
        vigenciaDesde: form.vigenciaDesde, vigenciaHasta: form.vigenciaHasta,
        ventana: { dias: form.ventanaDias, desde: form.ventanaDesde, hasta: form.ventanaHasta },
      },
      aprendizajes: form.aprendizajes,
      analitica: { ga4PropertyId: ga4, gscSitio: gsc },
      ads: { googleAdsCustomerId: gadsCid, metaAdAccountId: metaCuenta, topeMensual: topeAds },
      email: { listas: [...new Set(form.listasEmail.split(/[\s,]+/).map(Number).filter(n => Number.isInteger(n) && n > 0))] },
      updatedAt: serverTimestamp(), updatedBy: userEmail,
    }
    delete data.id
    try {
      await setDoc(doc(db, 'clients', c.id), data)
      // La credencial va a secretos/ (solo el motor la lee; el panel nunca la vuelve a mostrar)
      if (credencial) await setDoc(doc(db, 'secretos', `cliente_${c.id}_google`), { valor: JSON.stringify(credencial), updatedAt: serverTimestamp() })
      if (credGads) await setDoc(doc(db, 'secretos', `cliente_${c.id}_googleads`), { valor: JSON.stringify(credGads), updatedAt: serverTimestamp() })
      if (form.tokenMeta.trim()) await setDoc(doc(db, 'secretos', `cliente_${c.id}_metaads`), { valor: form.tokenMeta.trim(), updatedAt: serverTimestamp() })
      if (c.nombre && c.nombre !== nombre) await onRenamed?.(c.nombre, nombre)
      showToast('Ficha del cliente guardada')
      onClose()
    } catch (e) {
      console.error(e)
      showToast('No se pudo guardar la ficha', 'error')
    }
    setSaving(false)
  }

  const field = (label, k, { area = false, rows = 3, placeholder = '', hint = '', type = 'text' } = {}) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {area
        ? <textarea className="form-textarea" rows={rows} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder} />
        : <input className="form-input" type={type} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder} />}
      {hint && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{hint}</span>}
    </div>
  )

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <h2 className="modal-title">Ficha de {c.nombre || 'cliente'}</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: -8, marginBottom: 14 }}>
          Los agentes leen esta ficha en cada tarea de este cliente. Nunca ven la de otro cliente.
        </p>

        <div className="tab-row">
          {TABS.map(t => (
            <button key={t.id} type="button" className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(t.id)}>
              {t.label}{t.id === 'aprendizajes' && form.aprendizajes.length ? ` (${form.aprendizajes.length})` : ''}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          {tab === 'negocio' && <>
            <div className="form-row">
              {field('Nombre', 'nombre')}
              <div className="form-group">
                <label className="form-label">Estado</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={form.activo} onChange={e => set('activo', e.target.checked)} /> Cliente activo
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={form.interno} onChange={e => set('interno', e.target.checked)} /> Proyecto propio (interno)
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}
                  title="Los planes gratis (Gemini con cuenta personal, claves gratis) pueden usar lo que reciben para entrenar sus modelos">
                  <input type="checkbox" checked={form.permiteModelosGratis} onChange={e => set('permiteModelosGratis', e.target.checked)} />
                  <span>Permite modelos gratis <span style={{ fontSize: 11, color: 'var(--text-3)' }}>(pueden entrenar con los datos)</span></span>
                </label>
              </div>
            </div>
            {field('A qué se dedica', 'descripcion', { area: true, placeholder: 'Qué vende, cómo trabaja, qué lo diferencia…' })}
            {field('Servicios o productos', 'servicios', { area: true, hint: 'Uno por línea.' })}
            <div className="form-row">
              {field('Zona', 'zona', { placeholder: 'Ej. Cali, Colombia' })}
              {field('Público', 'publico', { placeholder: 'A quién le vende' })}
            </div>
            {departments.length > 0 && (
              <div className="form-group">
                <label className="form-label">Servicios contratados (departamentos)</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {departments.map(d => (
                    <label key={d.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                      <input type="checkbox" checked={form.departamentos.includes(d.id)} onChange={() => toggleDept(d.id)} /> {d.nombre}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>}

          {tab === 'marca' && <>
            {field('Tono de comunicación', 'tono', { area: true, rows: 2, placeholder: 'Ej. formal, de usted, sereno' })}
            <div className="form-row">
              {field('Colores', 'colores', { placeholder: '#2B3480, #2DC97E', hint: 'Separados por coma.' })}
              {field('Logo (URL)', 'logoUrl', { placeholder: 'https://…' })}
            </div>
            <div className="form-row">
              {field('Palabras o frases que sí', 'palabrasSi', { area: true, hint: 'Una por línea.' })}
              {field('Palabras o frases prohibidas', 'palabrasNo', { area: true, hint: 'Una por línea.' })}
            </div>
          </>}

          {tab === 'objetivos' && field('Objetivos de este trimestre', 'objetivos', { area: true, rows: 6, hint: 'Uno por línea. Los agentes orientan cada entrega a estos objetivos.' })}

          {tab === 'activos' && <>
            <div className="form-row">
              {field('Sitio web', 'web', { placeholder: 'https://…' })}
              {field('Redes', 'redes', { placeholder: '@usuario en Instagram, TikTok…' })}
            </div>
            {field('Repositorios', 'repos', { area: true, rows: 2, hint: 'Uno por línea.' })}
            {field('Carpeta de Google Drive', 'driveFolderId', { placeholder: 'Link o ID de la carpeta', hint: 'Se usa para el link de las entregas aprobadas.' })}
            {field('Biblioteca de fotos (ruta en el PC)', 'bibliotecaPath', { placeholder: 'Ej. SAOR/Biblioteca', hint: 'Relativa a la carpeta de la agencia en Drive.' })}
          </>}

          {tab === 'analitica' && <>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
              El agente de analítica lee solo la propiedad y el sitio de este cliente, con acceso de solo lectura. El cliente debe
              dar acceso a la cuenta de servicio: en GA4, Administrar → Gestión de acceso a la propiedad → Lector; en Search
              Console, Configuración → Usuarios y permisos → Restringido.
            </p>
            <div className="form-row">
              {field('ID de propiedad de GA4', 'ga4PropertyId', { placeholder: '123456789', hint: 'Números (Administrar → Detalles de la propiedad). No es el G-XXXX.' })}
              {field('Sitio de Search Console', 'gscSitio', { placeholder: 'sc-domain:ejemplo.com', hint: 'Propiedad de dominio (sc-domain:) o prefijo de URL (https://…/).' })}
            </div>
            <div style={{ fontSize: 12.5, padding: 10, background: 'var(--bg-2)', borderRadius: 8 }}>
              {estadoGoogle === null ? 'Consultando al motor…'
                : estadoGoogle.clientes?.[c.id] ? <>Credencial propia del cliente: <code>{estadoGoogle.clientes[c.id]}</code> (dale acceso a este correo)</>
                : estadoGoogle.cuentaAgencia ? <>Usa la cuenta de la agencia: <code>{estadoGoogle.cuentaAgencia}</code> (el cliente debe darle acceso a este correo)</>
                : 'No hay credencial: carga la de la agencia en Agencia → Motor → Claves, o una propia del cliente aquí abajo.'}
            </div>
            {field('Credencial propia del cliente (opcional)', 'credencialGoogle', { area: true, rows: 3, placeholder: 'Pega el JSON de la cuenta de servicio (solo si el cliente usa la suya)', hint: 'Se guarda aparte y no se vuelve a mostrar.' })}
            {estadoGoogle?.clientes?.[c.id] && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', alignSelf: 'flex-start' }}
                onClick={async () => { if (!confirm('¿Quitar la credencial propia de este cliente? Se usará la de la agencia.')) return; try { await deleteDoc(doc(db, 'secretos', `cliente_${c.id}_google`)); showToast('Credencial quitada', 'info') } catch { showToast('No se pudo quitar', 'error') } }}>
                Quitar credencial propia
              </button>
            )}
          </>}

          {tab === 'analitica' && <>
            <h4 style={{ margin: '12px 0 0', fontSize: 14 }}>Anuncios (solo lectura)</h4>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
              El agente de paid media lee estas cuentas para auditar y proponer; no cambia campañas. Si no pegas credenciales
              propias, se usan las de la agencia (Agencia → Motor → Claves).
              {estadoGoogle?.ads?.[c.id]?.length ? ` Credenciales propias cargadas: ${estadoGoogle.ads[c.id].join(', ')}.` : ''}
            </p>
            <div className="form-row">
              {field('ID de cliente de Google Ads', 'gadsCid', { placeholder: '123-456-7890' })}
              {field('Cuenta publicitaria de Meta', 'metaCuenta', { placeholder: 'act_1234567890' })}
              {field('Tope de gasto mensual', 'topeAds', { placeholder: 'Ej. 1500', hint: 'Avisa al llegar al 90 %.' })}
            </div>
            <div className="form-row">
              {field('Credencial propia de Google Ads (opcional)', 'credGads', { area: true, rows: 2, placeholder: '{"developer_token": …}', hint: 'No se vuelve a mostrar.' })}
              {field('Token propio de Meta Ads (opcional)', 'tokenMeta', { area: true, rows: 2, hint: 'No se vuelve a mostrar.' })}
            </div>
          </>}

          {tab === 'email' && <>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
              Listas de Listmonk de este cliente: el agente de email solo puede verlas y crear borradores en ellas. Usa solo
              listas con consentimiento de los suscriptores (Ley 1581). Para un CRM (HubSpot, Twenty) conecta su servidor MCP
              y agrégalo al agente en Herramientas extra.
            </p>
            {field('IDs de listas de Listmonk', 'listasEmail', { placeholder: '3, 7', hint: 'Los ves en Listmonk → Listas (columna ID).' })}
          </>}

          {tab === 'alcance' && <>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
              Autorización de pruebas de seguridad (plantilla en docs/plantillas/autorizacion-pruebas-seguridad.md, revisada
              por un abogado). El motor rechaza cualquier escaneo fuera de esta lista, sin firmante, sin documento, fuera de la
              vigencia o, si toca el sitio en vivo, fuera de la ventana. Solo pruebas pasivas.
            </p>
            <div className="form-row">
              {field('Dominios autorizados', 'dominios', { area: true, rows: 3, hint: 'Uno por línea. *.ejemplo.com para todos sus subdominios.' })}
              {field('Repositorios autorizados', 'alcanceRepos', { area: true, rows: 3, hint: 'URL https, uno por línea.' })}
            </div>
            <div className="form-row">
              {field('IPs o rangos autorizados', 'alcanceIps', { area: true, rows: 2, hint: 'Una por línea (203.0.113.10 o 203.0.113.0/28).' })}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={form.subdominios} onChange={e => set('subdominios', e.target.checked)} /> Incluye los subdominios de cada dominio
                </label>
              </div>
            </div>
            <div className="form-row">
              {field('Vigente desde', 'vigenciaDesde', { type: 'date' })}
              {field('Vigente hasta', 'vigenciaHasta', { type: 'date', hint: 'Máximo 90 días.' })}
            </div>
            <div className="form-group">
              <label className="form-label">Ventana para pruebas sobre el sitio en vivo (hora local)</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
                {['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'].map(d => (
                  <label key={d}><input type="checkbox" checked={form.ventanaDias.includes(d)}
                    onChange={() => set('ventanaDias', form.ventanaDias.includes(d) ? form.ventanaDias.filter(x => x !== d) : [...form.ventanaDias, d])} /> {d}</label>
                ))}
                <input className="form-input" type="time" style={{ width: 120 }} value={form.ventanaDesde} onChange={e => set('ventanaDesde', e.target.value)} />
                a
                <input className="form-input" type="time" style={{ width: 120 }} value={form.ventanaHasta} onChange={e => set('ventanaHasta', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              {field('Firmante (autorizado por)', 'autorizadoPor')}
              {field('Cargo del firmante', 'cargoFirmante', { placeholder: 'Representante legal, CTO…' })}
            </div>
            <div className="form-row">
              {field('Documento firmado (link)', 'documento', { placeholder: 'https://drive.google.com/…' })}
              {field('Fecha de la firma', 'alcanceFecha', { type: 'date' })}
            </div>
            {field('Fuera de alcance y notas', 'alcanceNotas', { area: true, rows: 2 })}
          </>}

          {tab === 'aprendizajes' && (
            <>
              <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 0 }}>
                Memoria del cliente: todos los agentes que trabajen para él la reciben en cada tarea. Es corta a propósito; se llena con
                tus correcciones y puedes editarla aquí.
              </p>
              <MemoriaEditor tipo="cliente" entradas={form.aprendizajes} onChange={v => set('aprendizajes', v)}
                vacio="Aún no hay aprendizajes. Se agregan cuando pides correcciones en una tarea de este cliente." />
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar ficha'}</button>
        </div>
      </div>
    </div>
  )
}
