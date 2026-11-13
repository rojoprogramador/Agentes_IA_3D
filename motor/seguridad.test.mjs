import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alcanceVigente, objetivoEnAlcance, hostEnAlcance, ipEnLista, argsDocker, owaspDe2021, leerGitleaks, leerOsv, leerSemgrep, leerTrivy, leerTestssl, leerZap, candadoLibre, normalizarRepo } from './seguridad.mjs'

const A = {
  dominios: ['ejemplo.com', '*.apps.ejemplo.com'], ips: ['203.0.113.0/28'], repos: ['https://github.com/cliente/web'],
  autorizadoPor: 'Ana Gómez', documento: 'https://drive/firmado.pdf', vigenciaDesde: '2026-11-01', vigenciaHasta: '2026-12-15',
  ventana: { dias: ['lunes', 'martes', 'miércoles', 'jueves'], desde: '22:00', hasta: '05:00' },
}
// 12-nov-2026 es jueves. 23:30 en Bogotá = 04:30 UTC del viernes 13
const JUEVES_NOCHE = Date.parse('2026-11-13T04:30:00Z')
const JUEVES_TARDE = Date.parse('2026-11-12T20:00:00Z') // 15:00 en Bogotá

test('vigencia, firmante, documento y máximo de 90 días', () => {
  assert.equal(alcanceVigente(null, 'codigo').ok, false)
  assert.match(alcanceVigente({ ...A, autorizadoPor: '' }, 'codigo', JUEVES_TARDE).motivo, /firmante/)
  assert.match(alcanceVigente({ ...A, documento: '' }, 'codigo', JUEVES_TARDE).motivo, /documento/)
  assert.match(alcanceVigente({ ...A, vigenciaHasta: '2026-11-10' }, 'codigo', JUEVES_TARDE).motivo, /venció/)
  assert.match(alcanceVigente({ ...A, vigenciaDesde: '2026-11-20' }, 'codigo', JUEVES_TARDE).motivo, /empieza/)
  assert.match(alcanceVigente({ ...A, vigenciaHasta: '2027-06-01' }, 'codigo', JUEVES_TARDE).motivo, /90 días/)
})

test('repos (no tocan producción) a cualquier hora; en vivo solo en la ventana, que puede cruzar la medianoche', () => {
  assert.equal(alcanceVigente(A, 'codigo', JUEVES_TARDE).ok, true)
  assert.match(alcanceVigente(A, 'tls', JUEVES_TARDE).motivo, /fuera de la ventana/)
  assert.equal(alcanceVigente(A, 'tls', JUEVES_NOCHE).ok, true)
  const domingo = Date.parse('2026-11-16T04:30:00Z') // domingo 23:30 en Bogotá
  assert.match(alcanceVigente(A, 'web_pasivo', domingo).motivo, /no está en la ventana/)
  assert.match(alcanceVigente({ ...A, ventana: null }, 'tls', JUEVES_NOCHE).motivo, /ventana horaria/)
})

test('objetivo dentro del alcance: dominios, comodín, subdominios, IPs y CIDR', () => {
  assert.ok(hostEnAlcance('ejemplo.com', A))
  assert.ok(!hostEnAlcance('www.ejemplo.com', A))
  assert.ok(hostEnAlcance('www.ejemplo.com', { ...A, subdominios: true }))
  assert.ok(hostEnAlcance('crm.apps.ejemplo.com', A))
  assert.ok(!hostEnAlcance('apps.ejemplo.com', A))
  assert.ok(!hostEnAlcance('ejemplo.com.evil.net', A))
  assert.ok(!hostEnAlcance('malejemplo.com', { ...A, subdominios: true }))
  assert.ok(ipEnLista('203.0.113.9', A.ips))
  assert.ok(!ipEnLista('203.0.113.20', A.ips))
  assert.ok(!ipEnLista('10.0.0.1', ['0.0.0.0/0']), 'rangos gigantes no cuentan')
})

test('objetivoEnAlcance por tipo', () => {
  assert.deepEqual(objetivoEnAlcance('codigo', 'git@github.com:Cliente/Web.git', A), { ok: true, objetivo: 'https://github.com/cliente/web' })
  assert.match(objetivoEnAlcance('codigo', 'https://github.com/otro/repo', A).motivo, /no está en los repositorios/)
  assert.deepEqual(objetivoEnAlcance('tls', 'https://ejemplo.com/x', A), { ok: true, objetivo: 'ejemplo.com' })
  assert.equal(objetivoEnAlcance('web_pasivo', 'ejemplo.com/tienda', A).objetivo, 'https://ejemplo.com/tienda')
  assert.match(objetivoEnAlcance('web_pasivo', 'https://otro.com', A).motivo, /no está en los dominios/)
  assert.match(objetivoEnAlcance('tls', 'https://ejemplo.com:8443', A).motivo, /puertos/)
  assert.match(objetivoEnAlcance('nmap', 'ejemplo.com', A).motivo, /desconocido/)
  assert.equal(normalizarRepo('HTTP://GitHub.com/a/b/'), 'https://github.com/a/b')
})

test('contenedor endurecido: sin root, sin capacidades, solo lectura, límites y repo de solo lectura', () => {
  const a = argsDocker('secretos', 'https://github.com/cliente/web', { src: '/t/repo', out: '/t/out', uid: 1000, gid: 1000 })
  const s = a.join(' ')
  for (const x of ['--rm', '--cap-drop ALL', 'no-new-privileges', '--read-only', '--user 1000:1000', '--cpus 1', '--memory 2g', '--pids-limit 256', '--network none', '/t/repo:/src:ro'])
    assert.ok(s.includes(x), x)
  assert.ok(argsDocker('dependencias', 'x', { src: '/s', out: '/o' }).join(' ').includes('--network bridge'))
  assert.ok(!argsDocker('tls', 'ejemplo.com', { out: '/o' }).join(' ').includes('/src'))
  assert.throws(() => argsDocker('codigo', 'x', { src: '/s', out: '/o', uid: 0 }), /root/)
  assert.ok(argsDocker('web_pasivo', 'https://ejemplo.com', { out: '/o' }).includes('zap-baseline.py'))
  assert.throws(() => argsDocker('vulnerabilidades', 'x', { src: '/s', out: '/o' }), /caché/)
  assert.ok(argsDocker('vulnerabilidades', 'x', { src: '/s', out: '/o', cache: '/c' }).join(' ').includes('/c:/cache:rw'))
})

test('OWASP: etiquetas 2021 se pasan a 2025', () => {
  assert.equal(owaspDe2021(['A03:2021 - Injection']), 'A05')
  assert.equal(owaspDe2021(['A06:2021 - Vulnerable and Outdated Components']), 'A03')
  assert.equal(owaspDe2021(['A10:2021 - Server-Side Request Forgery']), 'A01')
  assert.equal(owaspDe2021(['A02:2025 - Security Misconfiguration']), 'A02')
  assert.equal(owaspDe2021([]), null)
})

test('lectores: gitleaks nunca devuelve el secreto', () => {
  const r = leerGitleaks([{ Description: 'AWS Access Key', RuleID: 'aws-access-token', File: '/src/config.js', StartLine: 3, Commit: 'abcdef1234', Secret: 'AKIAREALKEY', Match: 'key=AKIAREALKEY' }])
  assert.equal(r.total, 1)
  assert.equal(r.hallazgos[0].ubicacion, 'config.js:3 (commit abcdef12)')
  assert.doesNotMatch(JSON.stringify(r), /AKIAREALKEY/)
  assert.equal(leerGitleaks(null).total, 0)
})

test('lectores: osv, semgrep, trivy, testssl y zap al formato común, ordenados por severidad', () => {
  const osv = leerOsv({ results: [{ source: { path: '/src/package-lock.json' }, packages: [{ package: { name: 'lodash', version: '4.17.15', ecosystem: 'npm' }, groups: [{ ids: ['GHSA-x'], max_severity: '9.1' }], vulnerabilities: [{ id: 'GHSA-x', aliases: ['CVE-2020-8203'], summary: 'Prototype pollution' }, { id: 'GHSA-y', summary: 'ReDoS', database_specific: { severity: 'MODERATE' } }] }] }] })
  assert.equal(osv.hallazgos[0].severidad, 'critica'); assert.equal(osv.hallazgos[1].severidad, 'media'); assert.equal(osv.hallazgos[0].owasp, 'A03'); assert.match(osv.hallazgos[0].referencia, /CVE-2020-8203/)
  const sg = leerSemgrep({ results: [
    { check_id: 'r.info', path: '/src/a.js', start: { line: 1 }, extra: { severity: 'INFO', message: 'nota', metadata: {} } },
    { check_id: 'r.sqli', path: '/src/db.js', start: { line: 9 }, extra: { severity: 'ERROR', message: 'SQL injection', metadata: { owasp: ['A03:2021 - Injection'], cwe: ['CWE-89'] } } },
  ], errors: [{}] })
  assert.equal(sg.hallazgos[0].referencia, 'r.sqli'); assert.equal(sg.hallazgos[0].owasp, 'A05'); assert.equal(sg.erroresHerramienta, 1)
  const tv = leerTrivy({ Results: [{ Target: 'Dockerfile', Misconfigurations: [{ ID: 'DS002', Title: 'Corre como root', Severity: 'HIGH', Status: 'FAIL' }, { ID: 'DS001', Status: 'PASS', Severity: 'LOW' }], Vulnerabilities: [{ PkgName: 'openssl', InstalledVersion: '1.1', VulnerabilityID: 'CVE-1', Severity: 'MEDIUM', FixedVersion: '1.2' }] }] })
  assert.deepEqual(tv.totales, { critica: 0, alta: 1, media: 1, baja: 0, info: 0 })
  const ts = leerTestssl([{ id: 'TLS1', severity: 'LOW', finding: 'offered (deprecated)' }, { id: 'cert_expiration', severity: 'OK', finding: 'ok' }, { id: 'BREACH', severity: 'MEDIUM', finding: 'potentially vulnerable', cve: 'CVE-2013-3587' }, { id: 'BREACH', ip: '2', severity: 'MEDIUM', finding: 'potentially vulnerable' }, { id: 'engine_problem', severity: 'WARN', finding: 'No engine' }])
  assert.equal(ts.total, 2); assert.equal(ts.hallazgos[0].severidad, 'media'); assert.equal(ts.hallazgos[0].owasp, 'A04')
  const zp = leerZap({ site: [{ '@name': 'https://ejemplo.com', alerts: [{ name: 'Falta Content-Security-Policy', riskcode: '2', cweid: '693', pluginid: '10038', solution: '<p>Configura CSP</p>', count: '4' }, { name: 'ZAP is Out of Date', riskcode: '1', pluginid: '10116' }] }] })
  assert.equal(zp.total, 1)
  assert.equal(zp.hallazgos[0].severidad, 'media'); assert.equal(zp.hallazgos[0].detalle, 'Configura CSP'); assert.equal(zp.hallazgos[0].owasp, 'A02')
})

test('candado: libre si no hay PID o si el proceso murió', () => {
  assert.ok(candadoLibre('', () => true))
  assert.ok(candadoLibre('123 2026-01-01', () => false))
  assert.ok(!candadoLibre('123 2026-01-01', () => true))
})

test('C5: las pruebas activas exigen autorización explícita, contacto, límite y ventana', async () => {
  const { leerNmap, leerNuclei } = await import('./seguridad.mjs')
  const activo = { ...A, pruebasActivas: true, contactoEmergencia: 'Ana 300 000 0000', limiteRps: 5 }
  assert.match(alcanceVigente(A, 'puertos', JUEVES_NOCHE).motivo, /no autoriza pruebas ACTIVAS/)
  assert.match(alcanceVigente({ ...activo, contactoEmergencia: '' }, 'puertos', JUEVES_NOCHE).motivo, /contacto de emergencia/)
  assert.match(alcanceVigente({ ...activo, limiteRps: 0 }, 'vulnerabilidades_web', JUEVES_NOCHE).motivo, /peticiones por segundo/)
  assert.match(alcanceVigente(activo, 'web_activo', JUEVES_TARDE).motivo, /fuera de la ventana/)
  assert.equal(alcanceVigente(activo, 'puertos', JUEVES_NOCHE).ok, true)
  assert.equal(alcanceVigente(activo, 'codigo', JUEVES_TARDE).ok, true, 'las pasivas siguen igual')
  const nmap = argsDocker('puertos', 'ejemplo.com', { out: '/o', rps: 500 }).join(' ')
  assert.match(nmap, /--max-rate 100/); assert.match(nmap, /-sT .*--unprivileged/); assert.match(nmap, /--cap-drop ALL/)
  const nuc = argsDocker('vulnerabilidades_web', 'https://ejemplo.com', { out: '/o', cache: '/c', rps: 3 }).join(' ')
  assert.match(nuc, /-rl 3/); assert.match(nuc, /-tags exposure,misconfig/); assert.match(nuc, /-etags dos,fuzz,bruteforce,intrusive/)
  assert.throws(() => argsDocker('vulnerabilidades_web', 'x', { out: '/o' }), /caché/)
  assert.match(argsDocker('web_activo', 'https://ejemplo.com', { out: '/o', rps: 4 }).join(' '), /zap-full-scan\.py.*scanner\.delayInMs=250/)
  const n = leerNmap('<port protocol="tcp" portid="443"><state state="open"/><service name="https" product="nginx"/></port><port protocol="tcp" portid="3306"><state state="open"/><service name="mysql" product="MySQL" version="8.0"/></port><port protocol="tcp" portid="25"><state state="closed"/></port>')
  assert.deepEqual(n.hallazgos.map(h => [h.severidad, h.ubicacion]), [['alta', '3306/tcp'], ['info', '443/tcp']])
  const u = leerNuclei('{"template-id":"CVE-2021-41773","info":{"name":"Apache path traversal","severity":"critical","tags":["cve","lfi"],"classification":{"cve-id":["CVE-2021-41773"]}},"matched-at":"https://e.com/cgi-bin/"}\nbasura\n')
  assert.deepEqual([u.total, u.hallazgos[0].severidad, u.hallazgos[0].owasp], [1, 'critica', 'A05'])
  assert.equal(leerNuclei('{"template-id":"git-config","info":{"name":"Git Config","severity":"medium","tags":["config","git","exposure","vuln"]}}').hallazgos[0].owasp, 'A02')
  assert.equal(leerNuclei('{"template-id":"CVE-x","info":{"name":"x","severity":"high","tags":["cve","apache"]}}').hallazgos[0].owasp, 'A03')
})

test('C5: una herramienta que falla no se reporta como "sin hallazgos"', async () => {
  const { fallaHerramienta, argsActualizarNuclei } = await import('./seguridad.mjs')
  assert.match(fallaHerramienta('nuclei', 1, '[FTL] Could not run nuclei: no templates provided for scan'), /plantillas/)
  assert.match(fallaHerramienta('nmap', 2, 'Failed to resolve'), /nmap terminó con error/)
  assert.equal(fallaHerramienta('nuclei', 0, '[INF] Scan completed'), '')
  assert.equal(fallaHerramienta('osv-scanner', 1, ''), '', 'osv sale con 1 cuando encuentra vulnerabilidades: no es falla')
  assert.ok(argsActualizarNuclei({ cache: '/c' }).join(' ').includes('-ut -ud /cache/nuclei-templates'))
})
