// Servidor MCP "agentes-auditoria" (fase B5): mediciones deterministas para los roles de SEO técnico y QA.
// El motor lo declara con --mcp-config solo en las tareas cuyo agente tiene el grupo "auditoria".
// Todo es de solo lectura sobre sitios PÚBLICOS: nada de localhost ni redes internas (ver urlAuditable).
//
//   pagespeed            → PageSpeed Insights (Lighthouse + datos reales de Chrome), cola de 4
//   rastrear_sitio       → navegador sin ventana: estado, title, description, H1, canonical, alt, errores JS…
//   accesibilidad        → axe-core (WCAG 2.x A/AA) sobre la página renderizada
//   robots_y_sitemap     → robots.txt, sitemaps y una muestra de sus URLs
//   datos_estructurados  → JSON-LD (tipos, propiedades que faltan), Open Graph y Twitter Card
//   capturas             → JPG de móvil y escritorio en salida/ para el informe
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import dns from 'node:dns/promises'
import { setDefaultResultOrder } from 'node:dns'
import { buscarNavegador } from './entregables.mjs'
import {
  urlAuditable, esIpPrivada, normalizarEnlace, parsearRobots, parsearSitemap, revisarSchema, resumirPageSpeed,
  resumirAxe, problemasPagina, duplicados, crearCola,
} from './auditoria.mjs'

const require = createRequire(import.meta.url)
setDefaultResultOrder('ipv4first') // en WSL y algunas redes IPv6 falla a medias (igual que en media-server)
const UA = 'Mozilla/5.0 (compatible; AgentesIA3D-Auditor/1.0)'
const colaPSI = crearCola(4)
const CWD = process.cwd() // carpeta de la tarea
const ok = (o) => ({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o, null, 1) }] })
const fail = (e) => ({ content: [{ type: 'text', text: `Error: ${e?.message || e}` }], isError: true })
const espera = (ms) => new Promise(r => setTimeout(r, ms))

// La URL y TODAS sus direcciones IP deben ser públicas (también en cada redirección)
async function publica(texto) {
  const u = urlAuditable(texto)
  const ips = await dns.lookup(u.hostname, { all: true }).catch(() => { throw new Error(`No existe el dominio ${u.hostname}`) })
  if (!ips.length || ips.some(x => esIpPrivada(x.address))) throw new Error('Solo se auditan sitios públicos')
  return u
}

// fetch con redirecciones revisadas a mano y tamaño máximo
async function pedir(url, { metodo = 'GET', maxBytes = 3_000_000, saltos = 5 } = {}) {
  let actual = (await publica(url)).href
  for (let i = 0; i <= saltos; i++) {
    const una = () => fetch(actual, { method: metodo, redirect: 'manual', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) })
    const r = await una().catch(async () => { await espera(1500); return una() }) // un reintento ante cortes de red
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      actual = (await publica(new URL(r.headers.get('location'), actual).href)).href
      continue
    }
    let texto = ''
    if (metodo === 'GET' && r.body) {
      const reader = r.body.getReader(); let n = 0; const partes = []
      for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; if (n > maxBytes) { reader.cancel(); break } partes.push(value) }
      texto = Buffer.concat(partes).toString('utf8')
    }
    return { estado: r.status, url: actual, texto, tipo: r.headers.get('content-type') || '' }
  }
  throw new Error('Demasiadas redirecciones')
}

async function abrirNavegador() {
  const exe = buscarNavegador()
  if (!exe) throw new Error('No encontré Chrome/Chromium en este PC (el mismo que usa el motor para los PDF)')
  return require('puppeteer-core').launch({ executablePath: exe, headless: /headless_shell/.test(exe) ? 'shell' : true, args: ['--no-sandbox', '--disable-gpu'] })
}

// Página con protección: no puede navegar ni pedir recursos a direcciones internas
async function nuevaPagina(browser, { movil = false } = {}) {
  const page = await browser.newPage()
  await page.setUserAgent(movil ? `${UA} Mobile` : UA)
  await page.setViewport(movil ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1366, height: 900 })
  await page.setRequestInterception(true)
  const info = { erroresConsola: 0, contenidoMixto: 0, fallidas: [] }
  page.on('request', async req => {
    try {
      const u = new URL(req.url())
      if (u.protocol === 'data:' || u.protocol === 'blob:') return req.continue()
      if (!['http:', 'https:'].includes(u.protocol)) return req.abort()
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) await publica(u.href)
      else urlAuditable(u.href) // recursos: sin localhost ni IP privada literal
      return req.continue()
    } catch { return req.abort('blockedbyclient') }
  })
  page.on('console', m => { if (m.type() === 'error') info.erroresConsola++ })
  page.on('pageerror', () => { info.erroresConsola++ })
  page.on('requestfailed', r => { if (info.fallidas.length < 20 && r.failure()?.errorText !== 'net::ERR_BLOCKED_BY_CLIENT') info.fallidas.push(`${r.url().slice(0, 120)} (${r.failure()?.errorText})`) })
  page.on('response', r => { if (page.url().startsWith('https:') && r.url().startsWith('http:')) info.contenidoMixto++ })
  return { page, info }
}

const server = new McpServer({ name: 'agentes-auditoria', version: '1.0.0' })

server.tool('pagespeed',
  'Mide la velocidad y calidad de una URL con PageSpeed Insights de Google (Lighthouse + datos reales de usuarios de Chrome si hay). Devuelve puntajes, Core Web Vitals, oportunidades de mejora y fallos de SEO y accesibilidad.',
  { url: z.string().url(), estrategia: z.enum(['mobile', 'desktop', 'ambas']).default('mobile') },
  async ({ url, estrategia }) => {
    try {
      const u = await publica(url)
      const clave = process.env.PAGESPEED_API_KEY || ''
      const una = (s) => colaPSI(async () => {
        const q = new URLSearchParams({ url: u.href, strategy: s })
        for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) q.append('category', c)
        if (clave) q.set('key', clave)
        for (let intento = 1; ; intento++) {
          const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(120_000) })
          const j = await r.json().catch(() => ({}))
          if (r.ok) return resumirPageSpeed(j)
          if ((r.status === 429 || r.status >= 500) && intento < 3) { await espera(5000 * intento); continue }
          throw new Error(`PageSpeed respondió ${r.status}: ${String(j?.error?.message || '').replace(/key=[^&\s]+/g, 'key=…').slice(0, 200)}${!clave && r.status === 429 ? ' (sin clave el cupo es muy bajo: carga PAGESPEED_API_KEY en Agencia → Motor)' : ''}`)
        }
      })
      const estrategias = estrategia === 'ambas' ? ['mobile', 'desktop'] : [estrategia]
      return ok(await Promise.all(estrategias.map(una)))
    } catch (e) { return fail(e) }
  })

server.tool('rastrear_sitio',
  'Recorre el sitio como un navegador (renderiza JavaScript) desde la URL dada, siguiendo enlaces internos. Por página: código de estado, title, meta description, H1, canonical, robots, imágenes sin alt, palabras, errores de JavaScript y contenido mixto. Además: enlaces rotos y títulos o descripciones duplicados. Guarda el detalle completo en auditoria/rastreo.json.',
  { url: z.string().url(), max_paginas: z.number().int().min(1).max(60).default(25), revisar_externos: z.boolean().default(true) },
  async ({ url, max_paginas, revisar_externos }) => {
    let browser
    try {
      // Se empieza en la URL final (p. ej. sitio.com → www.sitio.com) para no contar el mismo sitio dos veces
      const pre = await pedir(url, { metodo: 'HEAD' }).catch(() => null)
      const inicio = (await publica(pre?.url || url)).href
      browser = await abrirNavegador()
      const cola = [inicio], vistas = new Set([inicio]), paginas = [], externos = new Map(), internosRotos = []
      while (cola.length && paginas.length < max_paginas) {
        const actual = cola.shift()
        const { page, info } = await nuevaPagina(browser)
        try {
          const resp = await page.goto(actual, { waitUntil: 'networkidle2', timeout: 30_000 }).catch(e => { throw new Error(`no cargó (${e.message.split('\n')[0]})`) })
          const final = page.url()
          if (final !== actual) { if (vistas.has(final) && paginas.some(x => x.url === final)) continue; vistas.add(final) }
          const datos = await page.evaluate(() => {
            const meta = (n) => document.querySelector(`meta[name="${n}" i]`)?.content || ''
            return {
              titulo: document.title || '', descripcion: meta('description'), robots: meta('robots'),
              canonical: document.querySelector('link[rel="canonical"]')?.href || '', lang: document.documentElement.lang || '',
              viewport: !!document.querySelector('meta[name="viewport" i]'), h1: document.querySelectorAll('h1').length,
              h1Texto: document.querySelector('h1')?.innerText?.slice(0, 120) || '',
              imagenes: document.images.length, imagenesSinAlt: [...document.images].filter(i => !i.hasAttribute('alt')).length,
              palabras: (document.body?.innerText || '').split(/\s+/).filter(Boolean).length,
              enlaces: [...document.querySelectorAll('a[href]')].map(a => a.href).slice(0, 400),
            }
          })
          const p = { url: final, ...(final !== actual ? { pedida: actual } : {}), estado: resp?.status() || 0, ...(final.replace(/\/$/, '') !== actual.replace(/\/$/, '') ? { redirigeDesde: actual } : {}), ...datos, erroresConsola: info.erroresConsola, contenidoMixto: info.contenidoMixto }
          if (p.estado >= 400) internosRotos.push({ url: actual, estado: p.estado })
          for (const href of datos.enlaces) {
            const interno = normalizarEnlace(href, inicio)
            if (interno) { if (!vistas.has(interno)) { vistas.add(interno); cola.push(interno) } }
            else if (/^https?:/.test(href) && !externos.has(href) && externos.size < 150) externos.set(href, actual)
          }
          delete p.enlaces
          p.problemas = problemasPagina(p)
          paginas.push(p)
        } catch (e) {
          paginas.push({ url: actual, estado: 0, problemas: [String(e.message).slice(0, 160)] })
        } finally { await page.close().catch(() => {}) }
        await espera(300) // amable con el servidor del cliente
      }
      const externosRotos = []
      if (revisar_externos) {
        const lista = [...externos.entries()].slice(0, 40)
        const cola5 = crearCola(5)
        await Promise.all(lista.map(([href, desde]) => cola5(async () => {
          try {
            let r = await pedir(href, { metodo: 'HEAD' })
            if (r.estado === 405 || r.estado === 403) r = await pedir(href, { maxBytes: 20_000 })
            if (r.estado >= 400) externosRotos.push({ url: href, estado: r.estado, en: desde })
          } catch (e) { if (!/públicos|inválida/.test(e.message)) externosRotos.push({ url: href, estado: e.message.slice(0, 60), en: desde }) }
        })))
      }
      const conteo = new Map()
      for (const p of paginas) for (const x of p.problemas || []) { const k = x.replace(/\d+/g, 'N').replace(/\(.*\)/, '').trim(); conteo.set(k, (conteo.get(k) || 0) + 1) }
      const detalle = { inicio, paginas, internosRotos, externosRotos, titulosDuplicados: duplicados(paginas, 'titulo'), descripcionesDuplicadas: duplicados(paginas, 'descripcion') }
      mkdirSync(join(CWD, 'auditoria'), { recursive: true })
      writeFileSync(join(CWD, 'auditoria', 'rastreo.json'), JSON.stringify(detalle, null, 1))
      return ok({
        paginasRastreadas: paginas.length, quedaronSinRastrear: cola.length,
        problemasMasComunes: [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([problema, paginas]) => ({ problema, paginas })),
        internosRotos, externosRotos: externosRotos.slice(0, 20),
        titulosDuplicados: detalle.titulosDuplicados.slice(0, 10), descripcionesDuplicadas: detalle.descripcionesDuplicadas.slice(0, 10),
        paginas: paginas.map(p => ({ url: p.url, estado: p.estado, titulo: p.titulo?.slice(0, 80), problemas: p.problemas })).slice(0, 40),
        detalleCompleto: 'auditoria/rastreo.json',
      })
    } catch (e) { return fail(e) } finally { await browser?.close().catch(() => {}) }
  })

server.tool('accesibilidad',
  'Analiza la accesibilidad de una página con axe-core (WCAG 2.0/2.1/2.2 nivel A y AA) en un navegador real. Devuelve violaciones por impacto, cuántos elementos afecta cada una y ejemplos de selectores.',
  { url: z.string().url(), dispositivo: z.enum(['movil', 'escritorio']).default('escritorio') },
  async ({ url, dispositivo }) => {
    let browser
    try {
      const u = await publica(url)
      browser = await abrirNavegador()
      const { page } = await nuevaPagina(browser, { movil: dispositivo === 'movil' })
      await page.goto(u.href, { waitUntil: 'networkidle2', timeout: 45_000 })
      await page.addScriptTag({ content: require('axe-core').source })
      const r = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations', 'incomplete'] }))
      return ok({ url: page.url(), dispositivo, ...resumirAxe(r), nota: 'axe detecta cerca de la mitad de los problemas de accesibilidad; lo demás requiere revisión manual (teclado, lector de pantalla, textos).' })
    } catch (e) { return fail(e) } finally { await browser?.close().catch(() => {}) }
  })

server.tool('robots_y_sitemap',
  'Revisa robots.txt (si bloquea el sitio o a Google, qué sitemaps declara) y los sitemaps XML (cuántas URLs, lastmod) y comprueba una muestra de sus URLs (estado HTTP).',
  { url: z.string().url(), muestra: z.number().int().min(0).max(50).default(20) },
  async ({ url, muestra }) => {
    try {
      const base = await publica(url)
      const origen = base.origin
      const rob = await pedir(`${origen}/robots.txt`, { maxBytes: 500_000 }).catch(e => ({ estado: 0, texto: '', error: e.message }))
      const robots = rob.estado === 200 ? parsearRobots(rob.texto) : null
      const candidatos = [...new Set([...(robots?.sitemaps || []), `${origen}/sitemap.xml`, `${origen}/sitemap_index.xml`])]
      const sitemaps = [], urls = []
      const leer = async (s, nivel) => {
        if (sitemaps.length >= 8) return
        const r = await pedir(s, { maxBytes: 10_000_000 }).catch(e => ({ estado: 0, texto: '', error: e.message }))
        const p = r.estado === 200 ? parsearSitemap(r.texto) : null
        sitemaps.push({ url: s, estado: r.estado || r.error, tipo: p?.tipo, valido: p?.valido ?? false, entradas: p?.urls.length || 0, conLastmod: p?.urls.filter(x => x.lastmod).length || 0 })
        if (p?.tipo === 'indice' && nivel < 2) for (const x of p.urls.slice(0, 6)) await leer(x.loc, nivel + 1)
        else if (p) urls.push(...p.urls.map(x => x.loc))
      }
      for (const s of candidatos) { if (!sitemaps.some(x => x.url === s)) await leer(s, 0); if (urls.length) break }
      const revisadas = []
      const cola5 = crearCola(5)
      const paso = Math.max(1, Math.floor(urls.length / Math.max(1, muestra)))
      await Promise.all(urls.filter((_, i) => i % paso === 0).slice(0, muestra).map(x => cola5(async () => {
        const r = await pedir(x, { metodo: 'HEAD' }).catch(e => ({ estado: e.message.slice(0, 60) }))
        revisadas.push({ url: x, estado: r.estado, ...(r.url && r.url !== x ? { redirigeA: r.url } : {}) })
      })))
      const avisos = []
      if (!robots) avisos.push(`No hay robots.txt (respondió ${rob.estado || rob.error})`)
      if (robots?.bloqueaTodo) avisos.push('robots.txt BLOQUEA TODO el sitio (Disallow: /)')
      else if (robots?.bloqueaGoogle) avisos.push('robots.txt bloquea a Googlebot')
      if (robots && !robots.sitemaps.length) avisos.push('robots.txt no declara el sitemap')
      if (!urls.length) avisos.push('No encontré un sitemap con URLs')
      const malas = revisadas.filter(x => x.estado !== 200)
      if (malas.length) avisos.push(`${malas.length} de ${revisadas.length} URLs del sitemap no responden 200 (deberían ser solo URLs finales e indexables)`)
      return ok({ robots: robots ? { sitemaps: robots.sitemaps, bloqueaTodo: robots.bloqueaTodo, bloqueaGoogle: robots.bloqueaGoogle, grupos: robots.grupos.slice(0, 6) } : null, sitemaps, totalUrls: urls.length, muestraRevisada: revisadas, avisos })
    } catch (e) { return fail(e) }
  })

server.tool('datos_estructurados',
  'Extrae los datos estructurados de una página (JSON-LD), indica los tipos (LocalBusiness, Organization, Product, FAQPage…) y las propiedades obligatorias o recomendadas que faltan, y revisa Open Graph y Twitter Card para compartir en redes.',
  { url: z.string().url() },
  async ({ url }) => {
    let browser
    try {
      const u = await publica(url)
      browser = await abrirNavegador()
      const { page } = await nuevaPagina(browser)
      await page.goto(u.href, { waitUntil: 'networkidle2', timeout: 45_000 })
      const d = await page.evaluate(() => ({
        jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent || ''),
        microdatos: document.querySelectorAll('[itemscope]').length,
        og: Object.fromEntries([...document.querySelectorAll('meta[property^="og:"]')].map(m => [m.getAttribute('property'), m.content]).slice(0, 20)),
        twitter: Object.fromEntries([...document.querySelectorAll('meta[name^="twitter:"]')].map(m => [m.getAttribute('name'), m.content]).slice(0, 12)),
      }))
      const r = revisarSchema(d.jsonld)
      const avisos = []
      if (!d.jsonld.length) avisos.push('La página no tiene JSON-LD')
      for (const k of ['og:title', 'og:description', 'og:image', 'og:url']) if (!d.og[k]) avisos.push(`Falta ${k}`)
      if (!d.twitter['twitter:card']) avisos.push('Falta twitter:card')
      // Agrupado por tipo (un catálogo de servicios repite Offer/Service muchas veces)
      const porTipo = {}
      for (const it of r.items) {
        const g = porTipo[it.tipo] || (porTipo[it.tipo] = { cantidad: 0, faltan: new Set(), recomendados: new Set() })
        g.cantidad++; it.faltan.forEach(x => g.faltan.add(x)); it.recomendados.forEach(x => g.recomendados.add(x))
      }
      const tipos = Object.entries(porTipo).map(([tipo, g]) => ({ tipo, cantidad: g.cantidad, ...(g.faltan.size ? { faltanObligatorias: [...g.faltan] } : {}), ...(g.recomendados.size ? { faltanRecomendadas: [...g.recomendados] } : {}) }))
      return ok({ url: page.url(), bloquesJsonLd: d.jsonld.length, microdatos: d.microdatos, tipos, erroresJson: r.errores, openGraph: d.og, twitter: d.twitter, avisos, nota: 'Para confirmar resultados enriquecidos usa la Prueba de resultados enriquecidos de Google (search.google.com/test/rich-results).' })
    } catch (e) { return fail(e) } finally { await browser?.close().catch(() => {}) }
  })

server.tool('capturas',
  'Toma capturas de la página en móvil y escritorio (primera pantalla o página completa) y las guarda en salida/ para usarlas en el informe HTML. Devuelve las rutas.',
  { url: z.string().url(), nombre: z.string().regex(/^[a-z0-9-]{1,40}$/).default('pagina'), completa: z.boolean().default(false) },
  async ({ url, nombre, completa }) => {
    let browser
    try {
      const u = await publica(url)
      browser = await abrirNavegador()
      const dir = join(CWD, 'salida')
      mkdirSync(dir, { recursive: true })
      const rutas = []
      for (const movil of [true, false]) {
        const { page } = await nuevaPagina(browser, { movil })
        await page.goto(u.href, { waitUntil: 'networkidle2', timeout: 45_000 })
        const archivo = `captura-${nombre}-${movil ? 'movil' : 'escritorio'}.jpg`
        await page.screenshot({ path: join(dir, archivo), type: 'jpeg', quality: 70, fullPage: completa, captureBeyondViewport: completa })
        rutas.push(`salida/${archivo}`)
        await page.close()
      }
      return ok({ rutas, uso: 'En el HTML del informe (también en salida/) usa <img src="captura-….jpg">' })
    } catch (e) { return fail(e) } finally { await browser?.close().catch(() => {}) }
  })

await server.connect(new StdioServerTransport())
