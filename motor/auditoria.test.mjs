import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esIpPrivada, urlAuditable, normalizarEnlace, parsearRobots, parsearSitemap, revisarSchema, resumirPageSpeed, resumirAxe, problemasPagina, duplicados, crearCola } from './auditoria.mjs'

test('solo sitios públicos: IPs privadas, localhost, puertos y credenciales', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.20.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', '::ffff:10.0.0.1']) assert.ok(esIpPrivada(ip), ip)
  for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) assert.ok(!esIpPrivada(ip), ip)
  for (const u of ['http://localhost/', 'http://127.0.0.1/', 'http://169.254.169.254/latest', 'ftp://ejemplo.com', 'http://ejemplo.com:8080', 'http://a:b@ejemplo.com', 'http://intranet/', 'http://nas.local', 'http://[::1]/'])
    assert.throws(() => urlAuditable(u), u)
  assert.equal(urlAuditable('https://www.ejemplo.com/a#x').href, 'https://www.ejemplo.com/a')
})

test('enlaces internos: mismo sitio (con o sin www), sin #, sin archivos', () => {
  const b = 'https://www.ejemplo.com/'
  assert.equal(normalizarEnlace('/servicios#top', b), 'https://www.ejemplo.com/servicios')
  assert.equal(normalizarEnlace('https://ejemplo.com/x', b), 'https://ejemplo.com/x')
  assert.equal(normalizarEnlace('https://otro.com/', b), null)
  assert.equal(normalizarEnlace('/folleto.pdf', b), null)
  assert.equal(normalizarEnlace('mailto:a@b.com', b), null)
})

test('robots.txt: grupos, sitemaps y bloqueos', () => {
  const r = parsearRobots('User-agent: *\nDisallow: /admin\n\nUser-agent: Googlebot\nUser-agent: Bingbot\nDisallow: /\n# comentario\nSitemap: https://e.com/sitemap.xml')
  assert.deepEqual(r.sitemaps, ['https://e.com/sitemap.xml'])
  assert.equal(r.bloqueaTodo, false)
  assert.equal(r.bloqueaGoogle, true)
  assert.deepEqual(r.grupos[1].agentes, ['googlebot', 'bingbot'])
  assert.equal(parsearRobots('User-agent: *\nDisallow: /').bloqueaTodo, true)
  assert.equal(parsearRobots('User-agent: *\nDisallow:').bloqueaTodo, false)
})

test('sitemap: índice y urlset con entidades', () => {
  const i = parsearSitemap('<?xml version="1.0"?><sitemapindex><sitemap><loc>https://e.com/s1.xml</loc></sitemap></sitemapindex>')
  assert.equal(i.tipo, 'indice'); assert.equal(i.urls[0].loc, 'https://e.com/s1.xml')
  const u = parsearSitemap('<urlset><url><loc>https://e.com/?a=1&amp;b=2</loc><lastmod>2026-01-01</lastmod></url><url><loc> https://e.com/b </loc></url></urlset>')
  assert.deepEqual(u.urls, [{ loc: 'https://e.com/?a=1&b=2', lastmod: '2026-01-01' }, { loc: 'https://e.com/b', lastmod: '' }])
  assert.equal(parsearSitemap('<html>no</html>').valido, false)
})

test('schema: subtipos de negocio, @graph, faltantes y JSON roto', () => {
  const r = revisarSchema([
    JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Plumber', name: 'X' }, { '@type': 'FAQPage', mainEntity: [] }] }),
    '{ roto',
  ])
  const plumber = r.items.find(x => x.tipo === 'Plumber')
  assert.deepEqual(plumber.faltan, ['address'])
  assert.ok(plumber.recomendados.includes('telephone'))
  assert.deepEqual(r.items.find(x => x.tipo === 'FAQPage').faltan, ['mainEntity'])
  assert.equal(r.errores[0].bloque, 2)
  assert.deepEqual(revisarSchema([JSON.stringify({ '@type': 'Offer' })]).items[0].faltan, [])
})

test('PageSpeed: puntajes, métricas, oportunidades y fallos de SEO', () => {
  const j = {
    loadingExperience: { overall_category: 'AVERAGE', metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3100, category: 'AVERAGE' } } },
    lighthouseResult: {
      finalDisplayedUrl: 'https://e.com/', configSettings: { formFactor: 'mobile' },
      categories: { performance: { score: 0.62 }, seo: { score: 0.9, auditRefs: [{ id: 'meta-description' }, { id: 'hreflang' }] }, accessibility: { score: 1, auditRefs: [] } },
      audits: {
        'largest-contentful-paint': { displayValue: '4.1 s' },
        'unused-javascript': { id: 'unused-javascript', title: 'Reduce JS', score: 0.3, details: { type: 'opportunity', overallSavingsMs: 900 } },
        'render-blocking': { id: 'render-blocking', title: 'Bloqueo', score: 0.5, details: { type: 'opportunity', overallSavingsMs: 1500 } },
        'meta-description': { id: 'meta-description', title: 'Sin meta description', score: 0 },
        hreflang: { id: 'hreflang', title: 'hreflang', score: null, scoreDisplayMode: 'notApplicable' },
      },
    },
  }
  const r = resumirPageSpeed(j)
  assert.deepEqual(r.puntajes, { rendimiento: 62, accesibilidad: 100, buenasPracticas: null, seo: 90 })
  assert.equal(r.laboratorio.LCP, '4.1 s')
  assert.deepEqual(r.oportunidades.map(o => o.id), ['render-blocking', 'unused-javascript'])
  assert.deepEqual(r.seoFallidas.map(x => x.id), ['meta-description'])
  assert.deepEqual(r.campo.LCP, { p75: 3100, categoria: 'AVERAGE' })
})

test('axe: ordena por impacto y cuenta', () => {
  const r = resumirAxe({ violations: [
    { id: 'region', impact: 'moderate', help: 'h', tags: ['best-practice'], nodes: [{ target: ['div'] }] },
    { id: 'color-contrast', impact: 'serious', help: 'Contraste', tags: ['wcag2aa', 'wcag143'], nodes: [{ target: ['.a'] }, { target: ['.b'] }] },
    { id: 'image-alt', impact: 'critical', help: 'Alt', tags: ['wcag2a'], nodes: [{ target: ['img'] }] },
  ], incomplete: [{}], passes: [{}, {}] })
  assert.deepEqual(r.violaciones.map(v => v.id), ['image-alt', 'color-contrast', 'region'])
  assert.deepEqual(r.totales, { criticas: 1, graves: 1, moderadas: 1, menores: 0 })
  assert.equal(r.violaciones[1].elementos, 2)
})

test('problemas on-page y duplicados', () => {
  const p = problemasPagina({ url: 'https://e.com/a', estado: 200, titulo: 'x'.repeat(70), descripcion: '', h1: 2, robots: 'noindex', canonical: 'https://e.com/b', imagenesSinAlt: 3, viewport: true, lang: 'es', palabras: 50 })
  for (const k of ['Title largo', 'Sin meta description', '2 etiquetas H1', 'noindex', 'Canonical apunta', '3 imágenes sin alt', 'Poco contenido']) assert.ok(p.some(x => x.includes(k)), k)
  assert.deepEqual(problemasPagina({ url: 'https://e.com/', estado: 200, titulo: 'Plomeros en Cali 24 horas', descripcion: 'd', h1: 1, canonical: 'https://e.com', viewport: true, lang: 'es', palabras: 500 }), [])
  assert.deepEqual(duplicados([{ url: 'a', titulo: 'Hola' }, { url: 'b', titulo: 'hola ' }, { url: 'c', titulo: 'Otro' }], 'titulo'), [{ valor: 'hola', urls: ['a', 'b'] }])
})

test('cola: nunca más de N a la vez', async () => {
  const cola = crearCola(2)
  let activos = 0, maximo = 0
  await Promise.all(Array.from({ length: 6 }, () => cola(async () => { activos++; maximo = Math.max(maximo, activos); await new Promise(r => setTimeout(r, 10)); activos-- })))
  assert.equal(maximo, 2)
})
