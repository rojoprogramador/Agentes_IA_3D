// Auditoría web (fase B5): funciones puras que usa auditoria-server.mjs y prueba auditoria.test.mjs.
// Las herramientas son DETERMINISTAS: miden y devuelven datos (PageSpeed, rastreo, axe-core, robots, sitemap,
// schema). El agente de SEO técnico o de QA no inventa números: orquesta estas mediciones y redacta el informe.

// ---------- Seguridad: solo sitios públicos ----------
// Un agente podría pedir "auditar" http://localhost:8080 o la IP de metadatos de la nube (SSRF). Se bloquean
// direcciones privadas, de loopback, link-local, CGNAT y nombres internos, y solo se aceptan los puertos web.
export function esIpPrivada(ip) {
  const s = String(ip || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (s.includes(':')) {
    if (s === '::' || s === '::1') return true
    const v4 = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (v4) return esIpPrivada(v4[1])
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(s)
  }
  const p = s.split('.').map(Number)
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true // raro = no
  const [a, b] = p
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224
}

export function urlAuditable(texto) {
  let u
  try { u = new URL(String(texto || '').trim()) } catch { throw new Error('URL inválida') }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Solo se auditan sitios http o https')
  if (u.username || u.password) throw new Error('La URL no puede llevar usuario ni contraseña')
  if (u.port && !['80', '443'].includes(u.port)) throw new Error('Solo se auditan los puertos web (80 y 443)')
  const h = u.hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.')) throw new Error('Solo se auditan sitios públicos')
  if (/^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) { if (esIpPrivada(h)) throw new Error('Solo se auditan sitios públicos') }
  u.hash = ''
  return u
}

// Enlace del mismo sitio, absoluto y sin #fragmento (para el rastreador)
export function normalizarEnlace(href, base) {
  try {
    const u = new URL(href, base)
    if (!['http:', 'https:'].includes(u.protocol)) return null
    if (u.hostname.replace(/^www\./, '') !== new URL(base).hostname.replace(/^www\./, '')) return null
    u.hash = ''
    if (/\.(jpe?g|png|gif|webp|avif|svg|pdf|zip|mp4|mp3|webm|docx?|xlsx?|pptx?)$/i.test(u.pathname)) return null
    return u.href
  } catch { return null }
}

// ---------- robots.txt ----------
export function parsearRobots(txt) {
  const grupos = [], sitemaps = []
  let actual = null, ultimaFueAgente = false
  for (const cruda of String(txt || '').split(/\r?\n/)) {
    const linea = cruda.replace(/#.*/, '').trim()
    const m = linea.match(/^([A-Za-z-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const k = m[1].toLowerCase(), v = m[2].trim()
    if (k === 'sitemap') { if (v) sitemaps.push(v); continue }
    if (k === 'user-agent') {
      if (!actual || !ultimaFueAgente) { actual = { agentes: [], allow: [], disallow: [] }; grupos.push(actual) }
      actual.agentes.push(v.toLowerCase()); ultimaFueAgente = true; continue
    }
    ultimaFueAgente = false
    if (!actual) continue
    if (k === 'allow') actual.allow.push(v)
    if (k === 'disallow' && v) actual.disallow.push(v)
  }
  const general = grupos.find(g => g.agentes.includes('*'))
  const google = grupos.find(g => g.agentes.includes('googlebot')) || general
  const bloqueaTodo = (g) => !!g && g.disallow.includes('/') && !g.allow.some(a => a === '/' || a === '/*')
  return { grupos, sitemaps, bloqueaTodo: bloqueaTodo(general), bloqueaGoogle: bloqueaTodo(google) }
}

// ---------- sitemap.xml ----------
const entidades = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
export function parsearSitemap(xml) {
  const s = String(xml || '')
  const indice = /<sitemapindex[\s>]/i.test(s)
  const bloques = [...s.matchAll(indice ? /<sitemap>([\s\S]*?)<\/sitemap>/gi : /<url>([\s\S]*?)<\/url>/gi)].map(m => m[1])
  const urls = bloques.map(b => ({
    loc: entidades((b.match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i)?.[1] || '').trim()),
    lastmod: (b.match(/<lastmod>\s*([^<]*?)\s*<\/lastmod>/i)?.[1] || '').trim(),
  })).filter(u => u.loc)
  return { tipo: indice ? 'indice' : 'urlset', urls, valido: /<(urlset|sitemapindex)[\s>]/i.test(s) }
}

// ---------- Datos estructurados (JSON-LD) ----------
// Propiedades que Google pide para mostrar resultados enriquecidos de los tipos más comunes en negocios
export const REQUERIDOS = {
  Organization: ['name', 'url'], LocalBusiness: ['name', 'address'], Product: ['name'], Offer: [],
  Article: ['headline'], BlogPosting: ['headline'], NewsArticle: ['headline'], FAQPage: ['mainEntity'],
  BreadcrumbList: ['itemListElement'], Event: ['name', 'startDate', 'location'], Recipe: ['name', 'image'],
  Review: ['reviewRating', 'author'], AggregateRating: ['ratingValue'], WebSite: ['name', 'url'], Person: ['name'],
  Service: ['name'], VideoObject: ['name', 'thumbnailUrl', 'uploadDate'], JobPosting: ['title', 'datePosted', 'hiringOrganization'],
}
const RECOMENDADOS = {
  LocalBusiness: ['telephone', 'openingHoursSpecification', 'geo', 'url', 'image'], Organization: ['logo', 'sameAs'],
  Product: ['image', 'offers', 'aggregateRating'], Offer: ['price', 'priceCurrency'], Article: ['image', 'datePublished', 'author'], BlogPosting: ['image', 'datePublished', 'author'],
}
// LocalBusiness tiene muchos subtipos (Plumber, Dentist, Restaurant…): se tratan como LocalBusiness
const SUBTIPOS_NEGOCIO = /^(Plumber|Electrician|HVACBusiness|HomeAndConstructionBusiness|Dentist|Restaurant|Store|AutoRepair|LegalService|MedicalBusiness|ProfessionalService|BeautySalon|HealthAndBeautyBusiness|RealEstateAgent|FoodEstablishment|Hotel|LodgingBusiness|AccountingService|Locksmith|RoofingContractor|GeneralContractor|MovingCompany|CafeOrCoffeeShop|Bakery)$/

export function revisarSchema(bloques) {
  const items = []
  const visitar = (n, origen) => {
    if (Array.isArray(n)) return n.forEach(x => visitar(x, origen))
    if (!n || typeof n !== 'object') return
    if (n['@graph']) visitar(n['@graph'], origen)
    const tipos = [].concat(n['@type'] || []).map(String)
    for (const tipo of tipos) {
      const base = REQUERIDOS[tipo] ? tipo : SUBTIPOS_NEGOCIO.test(tipo) ? 'LocalBusiness' : null
      const vacio = (k) => n[k] === undefined || n[k] === null || n[k] === '' || (Array.isArray(n[k]) && !n[k].length)
      items.push({
        tipo, bloque: origen,
        faltan: base ? REQUERIDOS[base].filter(vacio) : [],
        recomendados: base ? (RECOMENDADOS[base] || []).filter(vacio) : [],
        conocido: !!base,
      })
    }
    for (const [k, v] of Object.entries(n)) if (k !== '@graph' && v && typeof v === 'object') visitar(v, origen)
  }
  const errores = []
  bloques.forEach((b, i) => {
    try { visitar(JSON.parse(b), i + 1) } catch (e) { errores.push({ bloque: i + 1, error: `JSON inválido: ${String(e.message).slice(0, 120)}` }) }
  })
  return { items, errores, tipos: [...new Set(items.map(x => x.tipo))] }
}

// ---------- PageSpeed Insights ----------
export function resumirPageSpeed(j) {
  const lh = j?.lighthouseResult || {}
  const cat = lh.categories || {}
  const pct = (c) => (typeof c?.score === 'number' ? Math.round(c.score * 100) : null)
  const a = lh.audits || {}
  const val = (id) => a[id]?.displayValue || null
  const campo = j?.loadingExperience?.metrics || {}
  const cf = (k) => campo[k] ? { p75: campo[k].percentile, categoria: campo[k].category } : null
  const oportunidades = Object.values(a)
    .filter(x => x?.details?.type === 'opportunity' && (x.details.overallSavingsMs || 0) > 0 && (x.score ?? 1) < 0.9)
    .sort((x, y) => (y.details.overallSavingsMs || 0) - (x.details.overallSavingsMs || 0))
    .slice(0, 8).map(x => ({ id: x.id, titulo: x.title, ahorroMs: Math.round(x.details.overallSavingsMs) }))
  const fallidas = (categoria) => (cat[categoria]?.auditRefs || [])
    .map(r => a[r.id]).filter(x => x && x.score !== null && x.score < 1 && x.scoreDisplayMode !== 'notApplicable' && x.scoreDisplayMode !== 'informative' && x.scoreDisplayMode !== 'manual')
    .slice(0, 12).map(x => ({ id: x.id, titulo: x.title, ...(x.displayValue ? { valor: x.displayValue } : {}) }))
  return {
    url: lh.finalDisplayedUrl || lh.finalUrl || j?.id || '', estrategia: lh.configSettings?.formFactor || '',
    puntajes: { rendimiento: pct(cat.performance), accesibilidad: pct(cat.accessibility), buenasPracticas: pct(cat['best-practices']), seo: pct(cat.seo) },
    laboratorio: { LCP: val('largest-contentful-paint'), CLS: val('cumulative-layout-shift'), TBT: val('total-blocking-time'), FCP: val('first-contentful-paint'), SpeedIndex: val('speed-index') },
    // Datos reales de usuarios de Chrome (CrUX), si el sitio tiene suficiente tráfico
    campo: { LCP: cf('LARGEST_CONTENTFUL_PAINT_MS'), INP: cf('INTERACTION_TO_NEXT_PAINT'), CLS: cf('CUMULATIVE_LAYOUT_SHIFT_SCORE'), general: j?.loadingExperience?.overall_category || null },
    oportunidades, seoFallidas: fallidas('seo'), accesibilidadFallidas: fallidas('accessibility'),
  }
}

// ---------- axe-core ----------
const PESO = { critical: 0, serious: 1, moderate: 2, minor: 3 }
export function resumirAxe(r) {
  const violaciones = (r?.violations || []).map(v => ({
    id: v.id, impacto: v.impact || 'minor', ayuda: v.help, wcag: (v.tags || []).filter(t => /^wcag\d/.test(t)), url: v.helpUrl,
    elementos: v.nodes?.length || 0, ejemplos: (v.nodes || []).slice(0, 3).map(n => [].concat(n.target || []).join(' ').slice(0, 160)),
  })).sort((a, b) => (PESO[a.impacto] ?? 9) - (PESO[b.impacto] ?? 9) || b.elementos - a.elementos)
  const cuenta = (i) => violaciones.filter(v => v.impacto === i).length
  return {
    violaciones, totales: { criticas: cuenta('critical'), graves: cuenta('serious'), moderadas: cuenta('moderate'), menores: cuenta('minor') },
    revisarAMano: (r?.incomplete || []).length, aprobadas: (r?.passes || []).length,
  }
}

// ---------- Problemas de SEO on-page de una página rastreada ----------
export function problemasPagina(p) {
  const out = []
  if (p.estado && p.estado !== 200) out.push(`Responde ${p.estado}`)
  if (p.redirigeDesde) out.push(`Se llega por redirección desde ${p.redirigeDesde} (enlaza directo a la URL final)`)
  const t = (p.titulo || '').trim()
  if (!t) out.push('Sin <title>')
  else if (t.length > 60) out.push(`Title largo (${t.length} caracteres; ideal ≤ 60)`)
  else if (t.length < 15) out.push(`Title muy corto (${t.length} caracteres)`)
  const d = (p.descripcion || '').trim()
  if (!d) out.push('Sin meta description')
  else if (d.length > 160) out.push(`Meta description larga (${d.length}; ideal ≤ 160)`)
  if ((p.h1 || 0) === 0) out.push('Sin H1')
  if ((p.h1 || 0) > 1) out.push(`${p.h1} etiquetas H1`)
  if (/noindex/i.test(p.robots || '')) out.push('Meta robots noindex')
  if (p.canonical && p.url && p.canonical.replace(/\/$/, '') !== p.url.replace(/\/$/, '')) out.push(`Canonical apunta a otra URL (${p.canonical})`)
  if (!p.canonical) out.push('Sin canonical')
  if (p.imagenesSinAlt) out.push(`${p.imagenesSinAlt} imágenes sin alt`)
  if (!p.viewport) out.push('Sin meta viewport (no es responsive)')
  if (!p.lang) out.push('Sin atributo lang en <html>')
  if (p.palabras !== undefined && p.palabras < 200) out.push(`Poco contenido (${p.palabras} palabras)`)
  if (p.erroresConsola) out.push(`${p.erroresConsola} errores de JavaScript en la consola`)
  if (p.contenidoMixto) out.push(`${p.contenidoMixto} recursos http en página https (contenido mixto)`)
  return out
}

// Títulos o descripciones repetidos entre páginas (canibalización)
export function duplicados(paginas, campo) {
  const m = new Map()
  for (const p of paginas) { const v = (p[campo] || '').trim().toLowerCase(); if (v) m.set(v, [...(m.get(v) || []), p.url]) }
  return [...m.entries()].filter(([, urls]) => urls.length > 1).map(([valor, urls]) => ({ valor, urls }))
}

// Semáforo simple para limitar llamadas en paralelo (PageSpeed: 4)
export function crearCola(max) {
  let activos = 0
  const espera = []
  const siguiente = () => { if (activos < max && espera.length) { activos++; espera.shift()() } }
  return (fn) => new Promise((ok, mal) => {
    espera.push(() => Promise.resolve().then(fn).then(ok, mal).finally(() => { activos--; siguiente() }))
    siguiente()
  })
}

// ---------- Certificado TLS (diagnóstico de caídas, C3) ----------
export function resumenCertificado(cert, { autorizado = true, error = '' } = {}, ahora = Date.now()) {
  if (!cert || !cert.valid_to) return { ok: false, aviso: `No se obtuvo el certificado${error ? `: ${error}` : ''}` }
  const vence = Date.parse(cert.valid_to)
  const dias = Math.floor((vence - ahora) / 86400000)
  const nombres = String(cert.subjectaltname || '').split(',').map(x => x.trim().replace(/^DNS:/, '')).filter(Boolean)
  const aviso = dias < 0 ? `VENCIDO hace ${-dias} días` : !autorizado ? `No es de confianza: ${error}` : dias <= 14 ? `Vence en ${dias} días: renovar ya` : ''
  return { ok: dias >= 0 && autorizado, emisor: cert.issuer?.O || cert.issuer?.CN || '', vence: new Date(vence).toISOString().slice(0, 10), diasRestantes: dias, nombres: nombres.slice(0, 10), aviso }
}
