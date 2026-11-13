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
- nuclei contra el mismo nginx con una carpeta `.git` expuesta: la detecta (media, A02) en 216 s. Con todas las
  plantillas no terminaba en 20 min y con el modo automático (`-as`) no la encontraba; por eso usa las etiquetas de
  exposición y mala configuración.

---

## C6 · Subagentes (tareas hijas en paralelo)

**Qué es.** Cuando el coordinador trabaja una **tarea del Pipeline** grande ("campaña de lanzamiento completa") y la
reparte, las tareas nuevas son **subtareas** de esa tarea: corren en paralelo con cada especialista y, cuando todas
entregan, el coordinador la retoma con los resultados y los **consolida** en una sola entrega para ti.

**Recorrido.**
```
Tarea padre → coordinador responde con un plan + bloque ```tareas``` (máx. 5)
  createDelegatedTasks(…, padre): cada hija lleva tareaPadreId, subtarea: true y el cliente del padre
  padre: agentStatus 'esperando_hijas', hijas: [ids], planCoordinador  (el motor no lo vuelve a tomar todavía)
Hijas → cada agente trabaja en paralelo (según los cupos de cada motor) → "Espera Aprobación"
eligible(padre): ¿todas las hijas entregaron (o fueron aprobadas)?  → sí → el coordinador recibe:
  "## Resultados de tus subtareas (CONSOLIDA)" + su plan + cada entrega → una sola entrega coherente
  (quitarBloques: al consolidar no puede volver a delegar)
```

**Dónde mirar.** `createDelegatedTasks`, `seccionHijas` y el bloque C6 de `runTask` en `motor/worker.mjs`;
`quitarBloques` y `hijasListas` en `motor/agencia.mjs` (con pruebas); estado en `ReviewPanel.jsx`.

**Por qué así.**
- **Paralelo de verdad**: el copy, el diseño y la estrategia se hacen a la vez, cada uno con su especialista.
- **Las hijas no delegan ni escriben memoria**: no son coordinadores (no pueden repartir) y no generan "aprendizaje
  propuesto" ni guardan correcciones en la memoria del cliente; eso lo hace el padre, que ve el conjunto. Así se evita
  que un árbol de tareas se ramifique sin control o llene la memoria de ruido.
- **Un solo nivel y máximo 5**: suficiente para una agencia y fácil de seguir en el tablero.
- **Una hija con error bloquea** al padre (hay que resolverla); una hija **borrada no** (no se queda esperando para
  siempre).

**Conceptos.**
- **Orquestador–trabajadores (fan-out / fan-in)**: uno reparte (fan-out), varios trabajan en paralelo y uno junta
  (fan-in). Es el patrón de los "subagentes" de Claude Code y de Hermes.
- **Barrera de sincronización**: el padre no sigue hasta que todos llegan (`hijasListas`).

**Verificado.** 1 prueba nueva (bloques y barrera: lista, pendiente, error y borrada). El flujo completo con tareas
reales necesita las reglas publicadas y un coordinador; queda para la prueba en producción.

---

## C7 · Optimización fuera de línea (mejorar los roles con su historial)

**Qué es.** B2 aprende de **una** tarea. C7 mira **todo el historial de un rol**: cuántas tareas se aprobaron a la
primera, cuántas se corrigieron y cuántas se rechazaron, y lee las notas que dejaste. Si encuentra un **patrón** ("le
corrigen siempre el largo", "siempre falta el llamado a la acción"), propone ajustar las instrucciones del rol. Tú
apruebas o editas; nada cambia solo.

**Recorrido.**
```
Cada 6 h el motor revisa: ¿algún rol activo sin revisar hace 30 días?   o   Agencia → Motor → "Revisar ahora"
  estadisticasRol(tareas de los agentes de ese rol, sin subtareas) → si hay ≥ 4 corregidas/rechazadas:
  promptOptimizacion (misión, instrucciones fijas, instrucciones aprendidas numeradas, resultados, notas del dueño)
  → modelo SIN Claude y SIN herramientas (la misma cadena de B2) → JSON {agregar, quitar, motivo}
  → parsearOptimizacion (máx. 3, < 300 caracteres, sin claves ni inyección, sin duplicados)
  → propuestas/{id} tipo 'rol' → Pipeline → Aprendizaje propuesto (editas y apruebas)
  → config/roles.<rol>.instruccionesExtra → perfilDe() las suma a las del catálogo en cada tarea
```

**Dónde mirar.** `motor/optimizacion.mjs` (puro), `correrOptimizacion` en `motor/worker.mjs`, `perfilDe`,
`PropuestaRol` en `PropuestasAprendizaje.jsx`, botón en Agencia → Motor → Aprendizaje.

**Por qué así.**
- **Patrones, no casos sueltos**: con menos de 4 correcciones no se propone nada; el prompt pide explícitamente
  patrones que se repiten.
- **No se toca `roles/catalogo.json`**: es código del repositorio. Lo aprendido vive en Firestore (`config/roles`),
  se puede quitar y no se mezcla con las actualizaciones del proyecto.
- **Instrucciones fijas vs. aprendidas**: las del catálogo no se pueden quitar; las aprendidas sí (máx. 8 por rol),
  para que el prompt no crezca sin límite.
- **Sin Claude por defecto**: es trabajo de fondo; usa la misma cadena barata de B2.

**Conceptos.**
- **Optimización de prompts fuera de línea**: mejorar las instrucciones con datos de uso real, en lote y con revisión
  humana, en vez de "en caliente" durante cada tarea.
- **Tasa de aprobación a la primera**: la métrica que importa; cada corrección es tiempo tuyo.

**Verificado.** 4 pruebas nuevas (clasificación de resultados, prompt, validación de la propuesta, aplicación con
tope). El ciclo con datos reales necesita tareas corregidas y las reglas publicadas.

---

## C8 · Salas por cliente

**Qué es.** Un chat de grupo **por cliente** en la Oficina (selector "Salas de clientes…"), con solo los agentes que
atienden a ese cliente. Responde el **agente líder** que elijas en la ficha; si la pregunta es de otro, el líder lo
dice en una línea y lo menciona con @Nombre, y ese agente contesta. Tú también puedes mencionar a quien quieras.

**Recorrido.**
```
Ficha del cliente → Negocio: "Sala de chat de este cliente" + líder
Oficina → "Salas de clientes…" → mensaje en agentChats/sala-<clienteId>
Motor (watchChats revisa cada minuto qué salas existen):
  participantesSala(): agentes activos que atienden a ese cliente (clientesPermitidos) y de sus departamentos
  quienResponde(): los @mencionados de la sala; si nadie, el líder
  agentReply(…, { cliente, participantes, lider }) con la ficha del cliente y buscar_historial SOLO de ese cliente
  → hasta 2 "pases de palabra" por mensaje
```

**Por qué así.**
- **Aislamiento**: la sala solo tiene agentes de ese cliente y su historial filtrado por el motor
  (`AGENTES_CLIENTE`), igual que en las tareas. Un agente mencionado que no atiende al cliente no responde.
- **Un líder decide** en lugar de que hablen todos: menos ruido, menos consumo y una respuesta ordenada.
- **Límite de saltos**: como en el chat de grupo, máximo 2 pases de palabra para que los agentes no se respondan sin
  fin.

**Conceptos.**
- **Enrutamiento por un agente líder (router)**: un agente que entiende la petición y la dirige al especialista; es
  como el recepcionista de la agencia.
- **Contexto por sala**: cada conversación arrastra solo su propio historial y la ficha de su cliente.

**Verificado.** 1 prueba nueva (participantes por cliente y departamento, mencionados fuera de la sala, líder por
defecto); compila. La conversación real necesita el motor y las reglas publicadas.

---

## C9 · El motor fuera del PC (Docker y VPS)

**Qué es.** Una imagen de Docker del motor y un `docker-compose.yml` para correrlo 24/7 en un servidor, con la guía
`docs/vps.md`. El panel sigue en Firebase; solo se muda el programa que corre los agentes.

**Cómo está armada la imagen** (`motor/Dockerfile`).
```
node:24 (Debian slim)
  + chromium y fuentes (PDF, vista previa, auditorías)  + git (skills, repos)  + cloudflared (túnel)  + tini
  npm install --omit=dev  (Claude Code, Codex y Gemini CLI vienen como dependencias de npm)
  usuario "node" (sin root) · datos en volúmenes: logs, trabajos, entregas, skills, sesión de Claude
docker compose up -d --build  → reinicio automático, TZ de Colombia, 1 GB de memoria compartida para Chromium
```

**Por qué así.**
- **El plan de Claude manda**: con **Pro** no conviene una cola desatendida 24/7 (límites de uso personal); en un
  servidor se usa **Max** (`claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`) o **clave de API**.
- **Sin puertos abiertos**: WhatsApp y las alertas entran por el túnel de Cloudflare, que sale del servidor.
- **Volúmenes**: el contenedor se puede borrar y reconstruir (actualizaciones) sin perder historial ni skills.
- **Sin acceso a Docker dentro del contenedor**: los escaneos de seguridad (B6/C5) necesitarían el socket de Docker,
  que equivale a darle control total del servidor; la guía explica cómo correr el motor sin contenedor si los
  necesitas.
- **tini**: reenvía la señal de apagado para que el motor cierre ordenado (y apague túneles y procesos hijos).

**Conceptos.**
- **Imagen y contenedor**: la imagen es la "receta" ya horneada; el contenedor, una copia en ejecución.
- **Volumen**: carpeta que vive fuera del contenedor y sobrevive a sus reinicios y reconstrucciones.
- **Capas de Docker**: se instala `package.json` antes de copiar el código, así cambiar el código no reinstala todo.

---

## D · Tour guiado dentro de la app

**Qué es.** Un recorrido que **ilumina** cada parte de la pantalla y explica para qué sirve. El botón **?** de la
cabecera explica la pantalla actual (Mayús + clic: el recorrido completo). En el primer ingreso aparece el recorrido
completo por todas las pantallas (reemplaza al tutorial viejo, que hablaba de timers y Pomodoro).

**Cómo funciona.**
```
app/src/tour.js        → TOURS: pasos por pantalla { sel (elemento), titulo, texto, admin }
                         pasosDe(modo, página, esAdmin): filtra los de admin y arma el recorrido
TourGuiado.jsx          → cambia de pantalla si hace falta, busca el elemento (reintenta mientras carga),
                         lo centra, lo ilumina (sombra enorme alrededor) y pone la tarjeta donde quepa
data-tour="…"           → marcas en la cabecera, la Oficina, el Pipeline y las pestañas de Agencia
```

**Por qué así.**
- **El contenido separado del componente**: para cambiar o agregar una explicación solo se edita `tour.js`.
- **Por rol**: un empleado ve 12 pasos de sus pantallas; un administrador, 27 (incluye Agencia, Clientes y Agentes).
- **Tolerante**: si el elemento no está (por ejemplo no hay propuestas pendientes), el paso se muestra al centro.
- **Teclado**: flechas para avanzar y retroceder, Esc para cerrar.

**Verificado.** Prueba de los pasos (27 admin / 12 empleado, filtrado por página) y capturas reales en Chromium de una
página de prueba: la tarjeta legible, centrada sin elemento y abajo cuando el elemento ocupa la pantalla; sin errores.
