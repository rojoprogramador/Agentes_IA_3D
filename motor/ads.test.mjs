import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerCredGoogleAds, cidValido, cuentaMetaValida, gaqlCampanas, gaqlTerminos, campanasGoogle, campanasMeta, conMetricas, totales, auditar } from './ads.mjs'

test('credenciales e IDs', () => {
  assert.equal(leerCredGoogleAds({ developer_token: 'd', client_id: 'c', client_secret: 's', refresh_token: 'r', login_customer_id: '123-456-7890' }).loginCustomerId, '1234567890')
  assert.throws(() => leerCredGoogleAds({ developer_token: 'd' }), /client_id/)
  assert.equal(cidValido('123-456-7890'), '1234567890'); assert.throws(() => cidValido('123'))
  assert.equal(cuentaMetaValida('act_98765'), '98765'); assert.throws(() => cuentaMetaValida('act_x'))
})

test('GAQL: solo lectura, fechas validadas, límite acotado', () => {
  const q = gaqlCampanas('2026-10-01', '2026-10-31')
  assert.match(q, /^SELECT /); assert.match(q, /BETWEEN '2026-10-01' AND '2026-10-31'/)
  assert.throws(() => gaqlCampanas("2026-10-01' OR 1=1 --", '2026-10-31'), /Fechas/)
  assert.match(gaqlTerminos('2026-10-01', '2026-10-31', 9999), /LIMIT 200$/)
})

test('normaliza Google (micros) y Meta (acciones de conversión)', () => {
  const g = campanasGoogle([{ campaign: { id: '1', name: 'Búsqueda plomería', status: 'ENABLED', advertisingChannelType: 'SEARCH' }, campaignBudget: { amountMicros: '20000000' }, metrics: { costMicros: '150500000', impressions: '4000', clicks: '60', conversions: 3, conversionsValue: 0, searchBudgetLostImpressionShare: 0.35 } }])
  assert.deepEqual([g[0].gasto, g[0].presupuestoDiario, g[0].conversiones, g[0].perdidaPorPresupuestoPct], [150.5, 20, 3, 35])
  const m = campanasMeta([{ campaign_id: '9', campaign_name: 'Leads', objective: 'OUTCOME_LEADS', spend: '80.25', impressions: '9000', clicks: '120', actions: [{ action_type: 'lead', value: '4' }, { action_type: 'link_click', value: '120' }, { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '2' }] }])
  assert.equal(m[0].conversiones, 6); assert.equal(m[0].gasto, 80.25)
  assert.deepEqual(conMetricas({ gasto: 100, impresiones: 1000, clics: 50, conversiones: 4, valor: 0 }), { gasto: 100, impresiones: 1000, clics: 50, conversiones: 4, valor: 0, ctrPct: 5, cpc: 2, cpa: 25, roas: null })
})

test('auditoría: propuestas sin aplicar nada', () => {
  const base = { plataforma: 'google', estado: 'ENABLED', presupuestoDiario: 20, valor: 0, perdidaPorPresupuestoPct: null }
  const camps = [
    { ...base, nombre: 'Sin conversiones', canal: 'SEARCH', gasto: 200, impresiones: 3000, clics: 40, conversiones: 0 },
    { ...base, nombre: 'Buena y limitada', canal: 'SEARCH', gasto: 100, impresiones: 2000, clics: 80, conversiones: 10, perdidaPorPresupuestoPct: 40 },
    { ...base, nombre: 'Cara', canal: 'SEARCH', gasto: 300, impresiones: 20000, clics: 150, conversiones: 3 },
    { ...base, nombre: 'Muy chica', canal: 'SEARCH', gasto: 5, impresiones: 10, clics: 1, conversiones: 0 },
  ]
  const r = auditar(camps, { terminos: [{ termino: 'plomero gratis', gasto: 30, conversiones: 0 }, { termino: 'plomero cali', gasto: 50, conversiones: 4 }], topeMensual: 500, gastoMes: 480 })
  const p = r.hallazgos.map(h => `${h.prioridad}|${h.campana}|${h.problema}`)
  assert.ok(p[0].startsWith('alta|(cuenta)|Gasto del mes al 96'))
  assert.ok(p.includes('alta|Sin conversiones|Gasta sin conversiones'))
  assert.ok(p.includes('media|Cara|Costo por conversión muy alto'))
  assert.ok(p.includes('media|Cara|CTR bajo en búsqueda'))
  assert.ok(p.includes('media|Buena y limitada|Pierde impresiones por presupuesto y convierte bien'))
  assert.ok(!p.some(x => x.includes('Muy chica')))
  assert.match(r.hallazgos.find(h => h.campana === '(términos de búsqueda)').evidencia, /plomero gratis/)
  assert.equal(r.totales.gasto, 605); assert.equal(r.campanas[0].nombre, 'Cara')
})
