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

---

## C2 · Email y CRM

**Qué es.** Un agente `email_marketing` que diseña secuencias (bienvenida, nutrición, reactivación) y, si tienes
**Listmonk** (gratis, se instala en tu servidor), deja cada correo como **campaña en borrador**. No existe ninguna
herramienta de envío: el envío lo das tú en Listmonk.

**Recorrido.**
```
Tarea "Secuencia de correos" → agente email_marketing
  entornoPorCliente(): URL de Listmonk (config/motor.email) + usuario de API (secreto LISTMONK_API)
                       + SOLO las listas de este cliente (clients.email.listas)
  email-server.mjs (MCP agentes-email)
    email_listas          → listas del cliente
    email_campanas        → campañas recientes en sus listas (para no repetir)
    email_crear_borrador  → POST /api/campaigns (queda "draft"); valida listas, asunto y limpia el HTML
  Respuesta con la secuencia completa → tú revisas y envías desde Listmonk
```

**Dónde mirar.** `motor/email.mjs`, `motor/email-server.mjs`, rol `email_marketing`, Agencia → Motor → *Email
(Listmonk)*, ficha del cliente → *Email*.

**Por qué así.**
- **Borrador, nunca envío**: un correo masivo enviado por error no se puede deshacer y afecta la reputación del
  dominio. Por eso la herramienta de envío ni existe.
- **Listas por cliente**: el agente de un cliente no puede ver ni usar las listas de otro (se comprobó con una lista
  ajena: error).
- **HTML limpio**: se quitan scripts, iframes y `on…=` del correo antes de guardarlo.
- **CRM por MCP**: HubSpot y Twenty tienen servidores MCP oficiales; se conectan en Claude y se agregan al agente en
  *Herramientas extra*, sin código nuevo.
- **Ley 1581 (datos personales)**: solo listas con consentimiento y siempre con enlace de baja `{{ UnsubscribeURL }}`.

**Conceptos.**
- **Listmonk**: gestor de listas y campañas de correo, de código abierto. Se conecta a un servicio de envío (SMTP, SES).
- **Usuario de API**: credencial `usuario:token` de Listmonk solo para integraciones (cabecera `Authorization: token …`).
- **Preheader**: la línea que se ve junto al asunto en la bandeja; casi tan importante como el asunto.

**Verificado.** 4 pruebas nuevas; punta a punta contra un Listmonk falso: solo ve sus listas, filtra campañas ajenas,
rechaza listas de otro cliente, crea el borrador y nunca llama a un endpoint de envío.

---

## C3 · DevOps y soporte (alertas de caída)

**Qué es.** Cuando **Uptime Kuma** (monitor de sitios gratis) detecta que un sitio de un cliente cayó, avisa al motor;
el motor te avisa por Telegram y crea **una** tarea urgente al agente `devops`, que diagnostica **desde afuera** y
propone cómo arreglarlo. Cuando el sitio vuelve, te avisa cuánto estuvo caído.

**Recorrido.**
```
Uptime Kuma ──POST JSON──► 127.0.0.1:8790/alertas/kuma/<token>  (o por el túnel si Kuma está en otro lado)
   token en tiempo constante → leerAlertaKuma → decidir():
     caído + sin incidente abierto → Telegram 🔴 + tarea "🔴 Caída: <monitor>" al agente DevOps (prioridad alta)
     caído + incidente abierto     → solo cuenta (no llena el tablero de tareas repetidas)
     arriba + incidente abierto    → Telegram 🟢 "volvió tras N min" + marca la tarea
Agente devops → diagnostico_sitio (DNS · HTTP ×3 con tiempos · certificado TLS) → diagnóstico + plan → tu revisión
```

**Dónde mirar.** `motor/alertas.mjs` (puro), `recibirAlerta`/`atenderAlerta` en `motor/worker.mjs`,
`diagnostico_sitio` en `motor/auditoria-server.mjs`, rol `devops`, Agencia → Motor → *Alertas de caída*.

**Por qué así.**
- **Un solo servidor de entrada**: WhatsApp y alertas comparten puerto y túnel; menos cosas expuestas.
- **Token en la URL**: Uptime Kuma no firma sus webhooks como Meta, así que el secreto va en la ruta y se compara en
  tiempo constante. Un token equivocado responde 401.
- **Una tarea por incidente**: un sitio caído manda una alerta por cada chequeo; sin esto, el tablero se llenaría.
- **Diagnóstico desde afuera, sin acceso a servidores**: el agente no tiene terminal ni credenciales de hosting. Mide
  lo que ve cualquier visitante y propone; el arreglo lo hace quien tiene acceso.
- **Clasificación de la causa**: dominio que no resuelve, certificado vencido, 5xx, 4xx o tiempo agotado; cada una
  apunta a un responsable distinto (DNS/registrador, hosting, desarrollador).

**Conceptos.**
- **Monitor de disponibilidad (uptime)**: un programa que visita el sitio cada minuto y avisa si falla.
- **Webhook**: el monitor llama a tu URL en vez de que tú le preguntes.
- **Códigos HTTP**: 2xx bien; 3xx redirección; 4xx error de la petición o configuración; 5xx falla del servidor.
- **Certificado TLS**: lo que hace que el sitio abra con candado (https). Si vence, los navegadores bloquean el sitio.

**Verificado.** 5 pruebas nuevas (lectura del webhook, token, asociación a cliente, una tarea por incidente,
enrutamiento del servidor compartido). `diagnostico_sitio` contra sitios reales: tu sitio (bien, certificado de
Let's Encrypt con 39 días), `expired.badssl.com` (detecta el certificado vencido) y un dominio inexistente.
**Falta**: conectar un Uptime Kuma real y publicar las reglas.

---

## C4 · GEO (¿las IA recomiendan a la marca?)

**Qué es.** Cada vez más gente le pregunta a ChatGPT, Gemini o similares "¿qué plomero me recomiendas en Cali?".
GEO (*Generative Engine Optimization*) mide si esas IA nombran al cliente. Cada semana el motor hace las mismas
preguntas a 2 o 3 modelos y registra si citan la marca, en qué lugar y qué competidores nombran.

**Recorrido.**
```
Ficha del cliente → GEO: marca, otros nombres, dominio, competidores, preguntas (≤10), modelos (≤3)
Motor (cada 30 min revisa; semanal por cliente, con el motor libre)   o   botón "Medir ahora" (geoPedidos)
  por cada modelo × pregunta: crearLlamada(mensajesGeo(pregunta))   ← la pregunta va SOLA, sin contexto del cliente
     analizarRespuesta → citada · lugar entre las marcas nombradas · competidores · fragmento
     → geoResultados/{cliente}/items
  Telegram: "las IA citaron la marca en 4 de 20 respuestas (20 %)"
Ficha → GEO: resumen por semana y por modelo, competidores más nombrados, cada respuesta
```

**Dónde mirar.** `motor/geo.mjs` (puro), `correrGeo`/`revisarGeo` en `motor/worker.mjs`,
`app/src/components/GeoCliente.jsx`, pestaña GEO de la ficha.

**Por qué así.**
- **La pregunta va sin contexto**: si le dijéramos al modelo quién es el cliente, lo nombraría siempre y la medición
  no valdría nada. Se pregunta como lo haría cualquier persona.
- **Las mismas preguntas cada semana**: así se ve la tendencia (si un cambio en la web o en reseñas hace que las IA
  empiecen a recomendar la marca).
- **Coincidencia por palabra completa y sin tildes**: "SAOR" no cuenta dentro de "SAORES"; "PLOMEROS Y ACABADOS
  CALI" sí cuenta aunque cambien mayúsculas o tildes.
- **Lugar entre las marcas**: no es lo mismo que te nombren primero que quinto.
- **Límites (10 × 3)**: 30 llamadas por semana por cliente; con modelos gratis o baratos el costo es casi cero. Se
  respeta la regla del cliente sobre modelos gratis.
- **Subcolección por cliente**: permite consultar "las últimas 300 por fecha" sin crear índices a mano en Firestore.

**Conceptos.**
- **GEO / AEO**: optimizar para aparecer en respuestas de IA (no solo en los 10 enlaces de Google). Influyen las
  reseñas, menciones en otros sitios, datos estructurados y contenido claro que responda preguntas.
- **Share of voice**: porcentaje de respuestas que nombran a la marca frente a sus competidores.
- **No determinismo**: un modelo puede responder distinto a la misma pregunta; por eso importa la tendencia de varias
  semanas más que una sola medición.

**Verificado.** 4 pruebas nuevas; ciclo completo con dos modelos falsos por HTTP (uno cita la marca en 2.º lugar,
otro no), confirmando que la pregunta no lleva el nombre del cliente. **Falta**: correrlo con modelos reales (necesita
proveedores en Modelos de IA) y publicar las reglas.

---

## C5 · Pentest activo (solo con contrato)

**Qué es.** Tres pruebas **activas** más en el servidor de seguridad de B6, para cuando el cliente firma una prueba de
penetración: `puertos` (nmap), `vulnerabilidades_web` (plantillas de nuclei) y `web_activo` (escaneo activo de ZAP,
que prueba inyecciones y XSS). Envían tráfico de prueba al sistema del cliente, así que tienen candados extra.

**Candados (todos a la vez).**
1. El alcance firmado tiene marcado **"autoriza pruebas ACTIVAS"** (ficha → Alcance; solo un admin).
2. Hay **contacto de emergencia** (a quién llamar si algo se cae) y **límite de peticiones por segundo**.
3. Vigencia ≤ 90 días y **ventana horaria** (como las pasivas en vivo).
4. Cada `run_scan` pide **tu aprobación** (B4).
5. El informe termina con un **bloque de firma** para el responsable humano: sin firma no es informe final.

**Recorrido.**
```
run_scan(tipo activo, objetivo) → objetivo en alcance → vigencia → ¿pruebasActivas + contacto + límite? → ventana
  → candado (uno a la vez) → contenedor endurecido con el límite de velocidad aplicado a la herramienta:
     nmap  --max-rate <límite> -sT --unprivileged (sin privilegios de red)
     nuclei -rl <límite> -etags dos,fuzz,bruteforce,intrusive (excluye lo peligroso)
     ZAP    scanner.threadPerHost=1, scanner.delayInMs=1000/<límite>
  → lectores: puertos abiertos (MySQL, Redis, RDP… expuestos = alta), hallazgos de nuclei con CVE, alertas de ZAP
```

**Por qué así.**
- **Legal**: una prueba activa sin autorización escrita es acceso abusivo a un sistema informático (Ley 1273,
  art. 269A). Por eso la casilla la marca un admin con el documento firmado, y el agente no puede cambiarla.
- **Operativo**: el contacto de emergencia y el límite de velocidad evitan tumbar el sitio del cliente; las
  plantillas de denegación de servicio, fuerza bruta y "intrusivas" están excluidas.
- **Nunca explotar**: el agente reporta lo que encuentra; no lo usa para entrar.
- **Firma humana**: un informe de seguridad tiene consecuencias (contratos, seguros, auditorías); lo firma una persona.

**Conceptos.**
- **Escaneo de puertos**: qué "puertas" de red están abiertas. Una base de datos (3306, 5432, 27017) o Redis (6379)
  abiertos a internet son un riesgo alto.
- **Escaneo TCP connect (`-sT`)**: abre la conexión completa como cualquier programa; no necesita privilegios de red
  (no se le da `NET_RAW` al contenedor).
- **nuclei**: miles de plantillas que comprueban vulnerabilidades conocidas (CVE) y malas configuraciones.
- **DAST activo**: ZAP envía entradas maliciosas de prueba (inyección SQL, XSS) y observa las respuestas.

**Verificado (contenedores reales).** 3 pruebas nuevas (requisitos de las activas, límite aplicado a cada herramienta,
lectores de nmap y nuclei, "una herramienta que falla no es 'sin hallazgos'").
- nmap contra `scanme.nmap.org` (servidor que el proyecto Nmap autoriza para pruebas): puertos 22 (OpenSSH 6.6.1),
  80 (Apache 2.4.7) y 9929, en 212 s con el límite de 5/s; `example.com` (fuera del alcance) rechazado.
- ZAP activo contra un nginx local propio: 9 hallazgos (falta CSP, anti-clickjacking, versión del servidor…) en 72 s.
- La primera prueba de nuclei "terminó sin hallazgos" en 1 s porque no había descargado sus plantillas: ahora se
  descargan a la caché la primera vez y, si una herramienta falla, se reporta como error, nunca como "todo bien".
