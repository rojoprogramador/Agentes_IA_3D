# Guía de las fases C y D

Qué se construyó en cada fase, cómo funciona, dónde conecta, por qué se hizo así y los conceptos técnicos.
(Las fases A y B están explicadas en los PR #7–#21 y en `CLAUDE.md`.)

---

## C1 · Paid media (Google Ads y Meta Ads)

**Qué es.** Un agente `paid_media` que lee las cuentas de anuncios del cliente y entrega una auditoría en PDF: cuánto
se gastó, cuántos clientes potenciales trajo cada campaña y a qué costo, dónde se pierde dinero y qué proponer. **No
puede cambiar nada**: no existe ninguna herramienta que pause, cree o modifique campañas.

**Recorrido.**
```
Tarea "Auditoría de anuncios" → agente paid_media → runClaude
  entornoPorCliente(): credencial de Google Ads / token de Meta + IDs de cuenta + tope, SOLO de ese cliente
  ads-server.mjs (MCP agentes-ads)
    estado_ads            → qué está conectado
    ads_auditoria         → Google: OAuth (refresh token) + GAQL ; Meta: /act_<id>/insights
                            → campañas normalizadas → auditar() → hallazgos + PROPUESTAS
    ads_terminos_busqueda → búsquedas reales que activaron anuncios (para negativas)
  HTML en salida/ → PDF → tú apruebas → una persona aplica los cambios en la plataforma
```

**Dónde mirar.** `motor/ads.mjs` (puro: GAQL, normalización, `auditar`), `motor/ads-server.mjs`, `entornoPorCliente`
en `motor/worker.mjs`, rol `paid_media` en `roles/catalogo.json`, ficha del cliente → *Analítica y anuncios*.

**Por qué así.**
- **Solo lectura por diseño**: tocar presupuestos es tocar dinero del cliente. El agente propone; una persona decide y
  aplica. Si algún día se agregan herramientas de cambio, irán por la aprobación de B4 con el tope de gasto.
- **Tope de gasto por cliente**: el informe avisa cuando el gasto del mes llega al 90 % del tope acordado.
- **Credenciales de la agencia o del cliente**: lo normal es una cuenta de administrador (MCC) de Google y un usuario
  del sistema en Meta con acceso a las cuentas de los clientes; un cliente puede tener las suyas.
- **Reglas de auditoría en código** (no en el modelo): "gasta sin convertir", "CPA 1,5× el de la cuenta", "CTR < 2 %
  en búsqueda", "pierde > 20 % por presupuesto y convierte bien", "búsquedas que gastan sin convertir". El modelo
  explica y prioriza, pero los hallazgos salen de cuentas reales.

**Conceptos.**
- **GAQL** (Google Ads Query Language): un SQL de solo lectura para pedir métricas. Las fechas se validan con un
  formato estricto para que nadie pueda inyectar texto en la consulta.
- **Micros**: Google Ads da el dinero en millonésimas (`150500000` = 150,50).
- **Developer token**: permiso de Google para usar la API de Ads; hay que pedirlo y aprobarlo (nivel básico basta).
- **Refresh token**: credencial de larga duración que se cambia por un token de acceso de 1 hora (OAuth 2.0).
- **CPA, CTR, ROAS**: costo por conversión, porcentaje de clics sobre impresiones y valor generado por cada peso.
- **Impresiones perdidas por presupuesto**: cuántas veces el anuncio no salió porque se acabó el presupuesto del día.

**Verificado.** 4 pruebas nuevas (normalización, GAQL a prueba de inyección, auditoría con 5 tipos de hallazgo) y
prueba de punta a punta contra Google Ads y Meta falsos (OAuth, developer token, insights, tope al 93 %).
**Falta**: probar con cuentas reales (requiere developer token aprobado y token de Meta).
