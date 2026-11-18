import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, createVerify } from 'node:crypto'
import { leerCuentaServicio, firmarJwt, rangoFechas, periodoAnterior, resolverFechas, hoyEn, cuerpoGa4, filasGa4, comparar, cuerpoGsc, filasGsc, totalesGsc, oportunidades, sitioGsc, propiedadGa4 } from './analitica.mjs'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
const SA = JSON.stringify({ type: 'service_account', client_email: 'lector@agencia.iam.gserviceaccount.com', private_key: privateKey, token_uri: 'https://oauth2.googleapis.com/token' })

test('cuenta de servicio: valida el JSON', () => {
  assert.equal(leerCuentaServicio(SA).email, 'lector@agencia.iam.gserviceaccount.com')
  assert.throws(() => leerCuentaServicio('no json'), /JSON válido/)
  assert.throws(() => leerCuentaServicio({ type: 'authorized_user' }), /cuenta de servicio/)
  assert.throws(() => leerCuentaServicio({ type: 'service_account', client_email: 'x@y.iam.gserviceaccount.com' }), /clave privada/)
})

test('JWT RS256 firmado y verificable, con alcances de solo lectura', () => {
  const jwt = firmarJwt(leerCuentaServicio(SA), undefined, Date.parse('2026-11-12T00:00:00Z'))
  const [h, p, f] = jwt.split('.')
  assert.ok(createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(f, 'base64url')))
  const claims = JSON.parse(Buffer.from(p, 'base64url'))
  assert.equal(claims.iss, 'lector@agencia.iam.gserviceaccount.com')
  assert.match(claims.scope, /analytics\.readonly/)
  assert.match(claims.scope, /webmasters\.readonly/)
  assert.doesNotMatch(claims.scope, /analytics(\s|$)|edit|manage/)
  assert.equal(claims.exp - claims.iat, 3600)
})

test('fechas: periodos, mes pasado, comparación y zona horaria', () => {
  assert.deepEqual(rangoFechas('mes_pasado', '2026-03-02'), { desde: '2026-02-01', hasta: '2026-02-28' })
  assert.deepEqual(rangoFechas('mes_pasado', '2026-01-15'), { desde: '2025-12-01', hasta: '2025-12-31' })
  assert.deepEqual(rangoFechas('ultimos_28', '2026-11-12'), { desde: '2026-10-15', hasta: '2026-11-11' })
  assert.deepEqual(periodoAnterior('2026-02-01', '2026-02-28'), { desde: '2026-01-01', hasta: '2026-01-31' })
  assert.deepEqual(periodoAnterior('2026-10-15', '2026-11-11'), { desde: '2026-09-17', hasta: '2026-10-14' })
  assert.equal(hoyEn('America/Bogota', Date.parse('2026-12-01T03:00:00Z')), '2026-11-30')
  assert.throws(() => resolverFechas({ desde: '2026-01-01', hasta: '2026-13-01' }, '2026-11-12'))
  assert.throws(() => resolverFechas({ desde: '2026-11-01', hasta: '2026-12-01' }, '2026-11-12'), /futura/)
  assert.throws(() => rangoFechas('siempre', '2026-11-12'), /desconocido/)
})

test('GA4: cuerpo con nombres válidos, filas y comparación', () => {
  const c = cuerpoGa4({ dimensiones: ['sessionDefaultChannelGroup'], metricas: ['sessions', 'keyEvents'], desde: '2026-10-01', hasta: '2026-10-31', limite: 999 })
  assert.equal(c.limit, 250)
  assert.deepEqual(c.orderBys, [{ metric: { metricName: 'sessions' }, desc: true }])
  assert.throws(() => cuerpoGa4({ metricas: ['sessions; DROP'] , desde: 'a', hasta: 'b' }), /inválido/)
  const f = filasGa4({ dimensionHeaders: [{ name: 'city' }], metricHeaders: [{ name: 'sessions' }], rows: [{ dimensionValues: [{ value: 'Cali' }], metricValues: [{ value: '120' }] }], rowCount: 1 })
  assert.deepEqual(f.filas, [{ city: 'Cali', sessions: 120 }])
  const cmp = comparar({ sessions: 150, engagementRate: 0.6123 }, { sessions: 100, engagementRate: 0.5 })
  assert.equal(cmp.sessions.cambioPct, 50); assert.equal(cmp.sessions.nombre, 'Sesiones')
  assert.equal(cmp.engagementRate.valor, 0.612)
  assert.equal(comparar({ sessions: 5 }, null).sessions.anterior, null)
})

test('Search Console: filas, totales ponderados y oportunidades', () => {
  assert.throws(() => cuerpoGsc({ desde: 'a', hasta: 'b', dimension: 'ciudad' }), /inválida/)
  const filas = filasGsc({ rows: [
    { keys: ['plomero cali'], clicks: 10, impressions: 1000, ctr: 0.01, position: 8.4 },
    { keys: ['destape cañerias'], clicks: 50, impressions: 200, ctr: 0.25, position: 2.1 },
    { keys: ['fugas agua cali'], clicks: 1, impressions: 400, ctr: 0.0025, position: 14 },
    { keys: ['raro'], clicks: 0, impressions: 10, ctr: 0, position: 9 },
  ] }, 'query')
  assert.equal(filas[0].ctrPct, 1)
  const t = totalesGsc(filas)
  assert.equal(t.clics, 61); assert.equal(t.impresiones, 1610)
  assert.equal(t.posicionMedia, Math.round(((8.4 * 1000 + 2.1 * 200 + 14 * 400 + 9 * 10) / 1610) * 10) / 10)
  const o = oportunidades(filas)
  assert.deepEqual(o.map(x => x.query), ['plomero cali', 'fugas agua cali'])
  assert.equal(o[0].potencial, 40)
})

test('propiedad y sitio: formato estricto', () => {
  assert.equal(propiedadGa4('properties/123456789'), '123456789')
  assert.throws(() => propiedadGa4('G-ABC123'), /solo números/)
  assert.equal(sitioGsc('sc-domain:Ejemplo.com'), 'sc-domain:ejemplo.com')
  assert.equal(sitioGsc('https://www.ejemplo.com'), 'https://www.ejemplo.com/')
  assert.throws(() => sitioGsc('ejemplo.com'))
})
