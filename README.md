# Agentes IA 3D

![Oficina con agentes de IA](docs/oficina-3d.jpg)

**Una oficina 3D con agentes de IA que trabajan para tu negocio o tu agencia.** Crea tu equipo de agentes (copies,
estrategia, diseño web, video, imágenes, SEO, asistente personal…), ponles el nombre que quieras, asígnales tareas
junto con tu equipo humano y míralos trabajar en una oficina 3D. Cada entrega llega a "Espera Aprobación":
**nada se publica sin ti**.

Funciona con **Claude Code** y tu propia suscripción de Claude. Código abierto (MIT), sin cuotas.

> Proyecto original de [Ederland Studio](https://eder-land.com). Si te sirve, dale una ⭐.

## Contenido

- [Qué incluye](#qué-incluye)
- [Qué necesitas](#qué-necesitas)
- [Instalación](#instalación)
- [Encender el motor](#encender-el-motor)
- [Cómo se usa](#cómo-se-usa)
- [Agencia: clientes, departamentos y skills](#agencia-clientes-departamentos-y-skills)
- [Cómo funciona por dentro](#cómo-funciona-por-dentro)
- [Archivos de configuración](#archivos-de-configuración)
- [Problemas comunes](#problemas-comunes)

## Qué incluye

- **Oficina 3D**: tu equipo humano y tus agentes en tiempo real. Ves quién trabaja, quién está en pausa y quién toma
  café. El coordinador camina hasta cada agente para entregarle las tareas. Gira la vista con `Q` / `E`.
- **Pipeline de tareas** (Kanban): pendiente → en progreso → espera aprobación → correcciones → completada, con
  cronómetro, prioridades, clientes, departamentos y reportes. La pestaña **Tareas** muestra la misma lista en tabla.
- **Agentes con roles y permisos por tarea**: elige del catálogo o crea los tuyos. Cada rol define qué herramientas
  puede usar, y un tipo de tarea o una tarea puntual pueden sumarle permisos (por ejemplo, crear un PDF).
- **Agencia multi-cliente**: ficha de cada cliente (negocio, marca, objetivos, activos, alcance y aprendizajes),
  departamentos, tipos de tarea con plantilla de brief y checklist, y revisión entre agentes antes de que la veas tú.
- **Tareas para un departamento**: asignas una tarea a "Marketing" en vez de a una persona; la toma quien llegue
  primero y, si nadie del equipo humano la toma, se la lleva un agente de ese departamento.
- **Tareas programadas**: rutinas que crean una tarea en cada fecha ("cada lunes a las 8, 5 ideas de posts"),
  desde el panel o pidiéndoselas al coordinador por chat o Telegram.
- **Versiones y Google Drive**: cada entrega queda guardada por cliente, departamento, fecha y versión; al aprobarla
  se copia a la carpeta `Aprobados` del cliente.
- **Entregables en PDF con vista previa**: el agente diseña en HTML A4, el motor lo convierte en PDF y tú ves cada
  página en miniatura antes de aprobar (brochures, portafolios, propuestas, flyers, presentaciones).
- **Buscador de skills**: busca, revisa e instala skills de Claude para tus agentes desde el panel.
- **Varios motores de IA trabajando en paralelo**: Claude Code, **Antigravity** (Google AI Pro/Ultra, con modelos
  Gemini, Claude y GPT-OSS), **Codex** (cuenta de ChatGPT) y **Gemini CLI** (clave de API) trabajan con herramientas;
  además, modelos con API compatible con OpenAI (Groq, Cerebras, OpenRouter, Gemini, Ollama…) que leen webs y adjuntos
  y escriben en `salida/` con herramientas acotadas. Si uno
  llega a su límite de uso, la tarea pasa sola al siguiente.
- **Chat con cada agente y chat de grupo**: los agentes te preguntan lo que les falta y colaboran con `@menciones`.
- **Asistente coordinador por Telegram** (opcional): háblale por texto o nota de voz, reparte tareas y te avisa
  cuando un agente termina o necesita información.
- **Editor de video local**: transcripción con Whisper, corte de silencios, limpieza de audio, subtítulos y
  animaciones con código ([HyperFrames](https://github.com/heygen-com/hyperframes)).
- **Avatares personalizables** para cada persona y agente, con vista previa 3D.

## Qué necesitas

**Obligatorio**

| Qué | Para qué |
|---|---|
| Un PC con Windows, macOS o Linux (en Windows sirve WSL) | Ahí corre el motor que ejecuta a los agentes. Los agentes trabajan **solo mientras está encendido**. |
| [Node.js 22 o superior](https://nodejs.org) | App y motor. |
| [Git](https://git-scm.com) | Descargar el proyecto y el buscador de skills. |
| Suscripción de Claude (Pro o Max) | Los agentes usan tu cuenta a través de Claude Code. Las tareas largas consumen el límite más rápido. |
| Cuenta de Google | Iniciar sesión y crear el proyecto de Firebase. |
| Proyecto de [Firebase](https://console.firebase.google.com) (plan gratis Spark) | Base de datos, inicio de sesión y publicación de la app. |

**Opcional**

| Qué | Para qué |
|---|---|
| Bot de Telegram (@BotFather) | Hablar con el coordinador y recibir avisos. El token se pega en **Agencia → Motor**. |
| Google Drive para escritorio o [rclone](https://rclone.org) | Que las entregas lleguen solas a Google Drive. |
| Gmail, Calendar y Drive conectados en claude.ai | Que el coordinador lea tu correo y calendario. |
| Chromium o Chrome | Crear los PDF. El motor usa el que ya trae (Playwright) o el de tu sistema. En Linux/WSL necesita `sudo apt-get install -y libnss3 libnspr4 libasound2t64`. |
| [Magnific](https://www.magnific.com) (de pago) | Rol de imágenes con IA. |
| Claves de ElevenLabs, HeyGen o Gemini | Voces y avatares en los videos (skills de HyperFrames). |
| Google AI Pro o Ultra + [Antigravity CLI](https://antigravity.google) | Motor Antigravity: `curl -fsSL https://antigravity.google/cli/install.sh \| bash` y luego `agy` para iniciar sesión. |
| Cuenta de ChatGPT | Motor Codex: `cd motor && npx codex login`. |
| Clave de Google AI Studio | Motor Gemini CLI: pégala en **Agencia → Motor → Claves**. Desde junio de 2026 Gemini CLI ya no acepta la cuenta gratis de Google. |

## Instalación

### Con el asistente (recomendado)

```bash
git clone https://github.com/rojoprogramador/Agentes_IA_3D.git
cd Agentes_IA_3D
claude
```

Dentro de Claude Code escribe:

```
/instalar
```

Claude te hace las preguntas (tu negocio, tu marca, tus agentes y sus roles), te guía para crear tu proyecto en
Firebase y deja la app publicada y el motor funcionando. Toma unos 30 minutos. **Nunca te pedirá tus contraseñas**:
cuando haga falta una, te abre el archivo para que la pegues tú.

### A mano (resumen de lo que hace el asistente)

1. **Firebase**: crea el proyecto, agrega una app web y copia su configuración. En Authentication habilita
   **Google** y **Correo/contraseña**, crea el **usuario robot** del motor (por ejemplo `tunombre+agentes@gmail.com`)
   y desactiva el registro público. Crea Firestore en modo producción.
2. **Configurar**: escribe `instalacion.json` (formato al inicio de `tools/configurar.mjs`) y ejecuta
   `node tools/configurar.mjs instalacion.json`. Genera `app/.env`, `motor/.env`, `motor/negocio.json` y pone el
   correo del robot en `firestore.rules`. Pega la contraseña del robot en `motor/.env → AGENT_PASSWORD`.
3. **Dependencias**: `npm install` dentro de `app/` y dentro de `motor/`.
4. **Publicar**:
   ```bash
   npx firebase-tools login
   cd app && npm run build && cd ..
   npx firebase-tools deploy --only hosting,firestore:rules
   ```
   Entra a `https://<tu-proyecto>.web.app` con la cuenta de Google del dueño: queda como Super Admin.
5. **Motor**: en `motor/`, `npm run check` (debe decir "Verificación OK") y `npm run crear-agentes`.
   Si no has iniciado sesión en Claude Code en ese PC: `npx claude auth login`.

## Encender el motor

| Sistema | Comando |
|---|---|
| Windows | `motor\iniciar-agentes.bat` |
| macOS / Linux / WSL | `bash motor/iniciar-agentes.sh` |

Déjalo abierto en su propia terminal: si se cae, se reinicia solo a los 15 segundos. En la Oficina debe aparecer
"Motor de agentes conectado". Lo que hace queda en `motor/logs/motor.log`.

Para que arranque con el PC: `powershell -ExecutionPolicy Bypass -File tools\inicio-automatico-windows.ps1`
(Windows) o `bash tools/inicio-automatico-mac.sh` (macOS).

Otros comandos dentro de `motor/`:

| Comando | Qué hace |
|---|---|
| `npm run check` | Verifica que el robot entra y tiene permisos, y sale. |
| `npm run agentes` | Lista los agentes con su ID y su rol. |
| `npm run crear-agentes` | Crea en la app los agentes de `negocio.json → equipo`. |
| `npm test` | Pruebas del armado de fichas y briefs. |

## Cómo se usa

### El ciclo de una tarea

1. **Crear**: botón **+ Nueva tarea** (en Mi Panel, Tareas o Agencia → Tareas). Pon nombre, descripción, cliente,
   departamento y, si quieres, un **tipo de tarea** para que el brief pida los campos que importan.
2. **Asignar** ("Asignado a"):
   - **Una persona** del equipo: le llega un correo y la ve en su panel.
   - **Un agente de IA**: el motor la toma, el agente trabaja y la tarea pasa a "En progreso".
   - **Un departamento completo**: la ve todo el departamento como "por tomar". La toma quien llegue primero
     ("Asignármela" en el Pipeline o "Tomarla" en Agencia → Tareas). Si en 30 minutos nadie del equipo humano la
     toma, el motor se la da a un agente de ese departamento (el que tenga el rol del tipo de tarea o el menos
     ocupado). Si el departamento no tiene personas, se la da de inmediato.
   - **Permisos del agente para esta tarea** (solo admin): suma permisos que su rol no trae, solo para esa tarea.
     Por ejemplo, "Crear archivos y PDF" para que el agente de SEO entregue un brochure. Los que tocan tus datos
     (Gmail, calendario) salen en rojo. Nunca se ofrece la terminal (Bash).
3. **Revisión entre agentes**: si el tipo de tarea tiene un rol revisor, otro agente revisa la entrega contra el
   checklist y la corrige una vez antes de mostrártela.
4. **Espera aprobación**: abres la tarea. Si el agente entregó un PDF, ves la vista previa de cada página (clic para
   ampliar) y los links al archivo en Drive. En el panel de revisión eliges:
   - **Aprobar**: se completa y la versión se copia a `Aprobados` del cliente.
   - **Pedir corrección**: el agente la ajusta con tu nota.
   - **Rechazar**: la rehace desde cero.
   Al corregir o rechazar puedes guardar la nota como **aprendizaje del cliente** (lo leerán todos los agentes que
   trabajen para él) o como **lección del agente** (la aplicará con todos sus clientes).
5. **Completada**: queda con su tiempo trabajado, sus versiones y quién la terminó.

**Detener una tarea**: mientras un agente trabaja (o espera en cola), abre la tarea y pulsa **Detener**. El motor corta
al agente en el momento, la tarea vuelve a "pendiente" y queda detenida: no la retoma sola. Lo que alcanzó a hacer
queda en su carpeta de trabajo. Pulsa **Reanudar** (o envíala a Correcciones con una nota) para que siga.

### Acciones que piden tu aprobación

Los agentes no tienen terminal, pero algunas herramientas sí tienen efecto fuera del sistema: crear borradores de
Gmail, crear o cambiar eventos del calendario (mandan invitaciones), crear o compartir archivos en Drive y gastar
créditos de Magnific. Cada vez que un agente quiere usar una, **el motor lo detiene y te pregunta**: aparece un aviso
arriba en el panel y un mensaje con botones en Telegram:

- **Una vez** · **Toda esta tarea** (no vuelve a preguntar por esa acción en esa tarea) · **Siempre** · **Denegar**.
- Sin respuesta en **5 minutos**, se deniega. En **tareas programadas** se deniega siempre (nadie está mirando),
  salvo lo aprobado "siempre".
- Si se deniega, el agente no insiste: deja el contenido listo en la entrega para que lo hagas tú.
- Crear el documento de entrega en la carpeta de Drive del propio agente no pregunta: es su forma normal de entregar.

Lo aprobado "siempre" se ve y se quita en **Agencia → Motor → Acciones con aprobación**. La lista de herramientas
está en `roles/catalogo.json → accionesConAprobacion`.

### Los dos links de la tarea

| Campo | Para qué sirve |
|---|---|
| **Link de recursos** | Lo que la tarea necesita para hacerse: referencias, carpeta del cliente, fotos, un documento con el brief. El motor se lo pasa al agente para que lo consulte. |
| **Link de la tarea terminada** | El entregable final. Lo pega quien termina la tarea. En tareas de agentes, el motor lo llena solo si la entrega incluye un link de Google Docs y el campo estaba vacío. No se copia al duplicar una tarea. |

Si llenas el link de la tarea terminada antes de que el agente trabaje, el agente lo recibe como referencia.

### Chat, café y Telegram

- **Chat**: en la Oficina, selecciona un agente → **Chatear**, o usa el chat de grupo con `@nombre`.
- **Descansos**: un agente o una persona puede ir por un café; vuelve solo a los 3 minutos o con
  **Volver a trabajar** / **Ya volví**. **Pasar a reserva** saca a un agente del equipo activo sin borrarlo.
- **Telegram** (si lo configuraste): escríbele o mándale una nota de voz al coordinador. Reparte las tareas y te
  avisa cuando un agente termina o necesita información; respondes a sus preguntas desde ahí mismo. Comandos: `/estado` (qué hace cada agente y cuánto lleva) y
  `/parar <número>` (detiene esa tarea).


### WhatsApp Business

El motor recibe mensajes de WhatsApp (Cloud API de Meta) sin servidor propio: abre el webhook en tu PC
(`127.0.0.1:8790/whatsapp`) y un **túnel de Cloudflare** lo publica.

1. Instala `cloudflared` en el PC del motor ([descargas oficiales](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/);
   en Linux/WSL basta copiar el binario a `~/.local/bin`).
2. En Meta for Developers crea una app de tipo Business con el producto WhatsApp. Copia el **Phone number ID**, un
   **token permanente** (usuario del sistema con `whatsapp_business_messaging`) y el **app secret**.
3. **Agencia → Motor**: activa WhatsApp, pega el Phone number ID y las claves. El panel te muestra la **URL del webhook**
   y el **token de verificación**: pégalos en Meta → WhatsApp → Configuración y suscríbete a `messages`.
4. Sin token de Cloudflare la URL es `*.trycloudflare.com` y **cambia en cada encendido** (para probar). Para una URL
   fija crea un túnel en Cloudflare Zero Trust y pega su token en **Claves**.

Cuando alguien escribe por primera vez recibe un **código**; tú lo apruebas en **Agencia → WhatsApp** como:

- **Dueño**: habla con el coordinador, igual que por Telegram (también notas de voz).
- **Cliente** (de una ficha): su mensaje queda en la **bandeja** y en el historial de ese cliente; ningún agente le
  responde solo, contestas tú desde la bandeja. WhatsApp solo deja escribir libre dentro de las 24 h siguientes a su
  último mensaje.

Cada mensaje de Meta se verifica con su firma (HMAC con el app secret); sin firma válida se rechaza.

## Agencia: clientes, departamentos y skills

Las pantallas **Agentes**, **Clientes** y **Agencia** solo las ve el Super Admin.

- **Memoria con límite**: cada agente (2.200 caracteres), cada cliente (2.200) y tu perfil (1.375, en Agencia → Motor)
  tienen una memoria corta que va en cada tarea. Se llena con tus correcciones y la editas en la ficha. Si algo nuevo
  no cabe, hay que consolidar (editar o quitar) en vez de acumular; las entradas con claves, texto invisible o
  instrucciones para saltarse las reglas se rechazan.
- **Historial buscable**: todo lo que pasa en las tareas (brief, entregas, observaciones del revisor, tus correcciones,
  preguntas y respuestas) queda en `motor/logs/historial.db`. En cada tarea el agente tiene la herramienta
  `buscar_historial` para consultar lo que ya se hizo **con ese mismo cliente** (nunca con otros). Las claves se
  borran antes de guardar. Al encender, el motor agrega las tareas que ya existen.
- **Aprendizaje propuesto**: al aprobar una tarea que tuvo correcciones, rechazo u observaciones del revisor, un modelo
  sin herramientas (por defecto Antigravity, Codex, Gemini o un modelo por API, **no** Claude) propone qué guardar en
  la memoria del cliente o del agente, o una skill nueva. Aparece arriba del Pipeline; nada se aplica sin que lo
  apruebes. Las skills de un cliente quedan en `motor/skills-clientes/<cliente>/` y solo se copian a sus tareas.
  Se configura en Agencia → Motor.
- **Clientes**: la ficha de cada cliente (negocio, marca, objetivos, activos, alcance, aprendizajes y departamentos
  contratados). Un agente solo recibe la ficha del cliente de su tarea; nunca ve la de otros clientes.
- **Agencia → Tareas**: todas las tareas agrupadas por departamento, con filtro por cliente. Es la misma lista que
  la pestaña Tareas y el Pipeline, vista de otra forma.
- **Agencia → Programadas**: rutinas diarias, semanales (con días) o mensuales (día fijo o último día), con hora y
  zona horaria. Cada una lleva la plantilla de la tarea (a quién, cliente, tipo, brief, prioridad, días para vencer
  y permisos). Puedes pausarlas, **Ejecutar ahora** y ver las tareas que crearon. Si la tarea anterior sigue
  pendiente, esa vez se salta para no apilar trabajo; si el PC estuvo apagado, no se crean todas las perdidas: la
  rutina sigue desde la siguiente fecha. El coordinador también las crea si le dices "cada…".
- **Agencia → Departamentos**: los equipos de la agencia y quién pertenece a cada uno. Las personas se asignan en
  **Team → editar persona → Departamento**; los agentes, en **Agentes → Editar**.
- **Agencia → Tipos de tarea**: plantilla de brief (campos obligatorios), checklist, rol que la hace, rol que la
  revisa, formato de entrega y **permisos extra** que recibe cualquier agente que haga ese tipo de tarea.
- **Agencia → Modelos de IA**: agrega proveedores compatibles con OpenAI. La clave se guarda en tu Firebase y
  **solo la lee el motor**: el panel no puede volver a mostrarla. Los agentes que usan herramientas (web, archivos,
  video) siempre van con Claude Code.
- **Agencia → Skills**: el buscador de skills (abajo).
- **Agencia → Motor**: claves (Telegram, Gemini) y ajustes del motor: tareas en paralelo por motor, orden de respaldo,
  espera de las tareas de departamento, zona horaria, tu ID de Telegram y fuentes de skills. El motor los aplica al
  momento, sin reiniciar. Las claves quedan en la colección `secretos`: el panel las escribe pero **solo el motor puede
  leerlas**. Lo que no definas ahí sale de `motor/.env` y `motor/negocio.json`.

### SEO técnico y QA

Dos roles miden sitios web con herramientas reales (servidor MCP `agentes-auditoria`, solo de lectura y solo
sitios públicos) y entregan un informe en PDF con vista previa:

- **SEO técnico** (tipo de tarea *Auditoría SEO técnica*): PageSpeed Insights (Core Web Vitals de laboratorio y de
  usuarios reales), rastreo del sitio (title, description, H1, canonical, redirecciones, enlaces rotos, duplicados),
  robots.txt y sitemaps, y datos estructurados (JSON-LD, Open Graph).
- **QA** (tipo *QA de sitio o landing*): enlaces rotos, errores de JavaScript, contenido mixto, accesibilidad con
  axe-core (WCAG 2.2 AA) en móvil y escritorio, y capturas.

Cada hallazgo lleva la cifra medida y la herramienta que la midió: el agente no inventa números. Para PageSpeed
carga una clave gratis en **Agencia → Motor → Clave de PageSpeed Insights** (sin clave el cupo diario es mínimo).
El rastreo va despacio (una página a la vez) para no cargar el servidor del cliente.

### Seguridad pasiva (Docker)

El rol **Auditoría de seguridad (pasiva)** (tipo *Análisis de seguridad de un repositorio*) revisa el código y la
configuración de un cliente **solo dentro del alcance que firmó**:

1. El cliente firma la autorización (`docs/plantillas/autorizacion-pruebas-seguridad.md`; que la revise un abogado).
2. Un admin la carga en la ficha del cliente → **Alcance**: dominios, IPs, repositorios, vigencia (máximo 90 días),
   ventana horaria para pruebas en vivo, firmante y link al documento firmado.
3. El agente pide cada escaneo y **tú lo apruebas** (como cualquier acción con efecto externo). El motor lo rechaza si
   el objetivo no está en el alcance, si venció o si está fuera de la ventana.

| Tipo | Herramienta | Toca producción |
|---|---|---|
| secretos | gitleaks (también el historial de git) | No |
| dependencias | osv-scanner | No |
| codigo | semgrep (reglas OWASP Top 10) | No |
| vulnerabilidades | trivy (dependencias, Dockerfile/IaC, secretos) | No |
| tls | testssl.sh | Sí, en la ventana |
| web_pasivo | OWASP ZAP baseline (observa, no ataca) | Sí, en la ventana |

Cada escaneo corre en un contenedor desechable y aislado (sin root, sin capacidades, solo lectura, CPU y memoria
limitadas) y uno a la vez. Todo queda registrado en `motor/logs/seguridad-registro.jsonl`. No hay escaneos activos
(puertos, ataques): no están permitidos en esta versión. Requiere **Docker** en el PC del motor
(Ubuntu/WSL: `sudo apt-get install -y docker.io && sudo usermod -aG docker $USER`). El permiso de Docker se aplica
al abrir una sesión nueva: cierra la terminal (o `wsl --shutdown` desde Windows) antes de encender el motor. La
primera vez cada herramienta descarga su imagen y Trivy su base (~130 MB, queda en `motor/logs/cache-trivy`).

### Alertas de caída (Uptime Kuma + DevOps)

Activa **Agencia → Motor → Alertas de caída** y pega la URL que te muestra en Uptime Kuma → Notificaciones → Webhook.
Cuando un sitio cae: aviso por Telegram y una tarea urgente al agente **DevOps y soporte**, que diagnostica desde afuera
(DNS, HTTP, certificado) y propone el arreglo. Cuando vuelve, te avisa cuánto estuvo caído.

### Email marketing (Listmonk)

El rol **Email marketing** (tipo *Secuencia de correos*) redacta secuencias y, con **Listmonk** conectado (Agencia →
Motor: URL; Claves: usuario de API), las deja como **borradores**; el envío lo das tú en Listmonk. Cada cliente solo
usa las listas que le asignes (ficha → Email). Para CRM (HubSpot, Twenty) conecta su servidor MCP y agrégalo al agente.

### Paid media (Google Ads y Meta Ads)

El rol **Paid media** (tipo *Auditoría de anuncios*) lee las campañas del cliente en **solo lectura** y entrega un PDF
con gasto, resultados, desperdicio y **propuestas**; no cambia nada en las cuentas. Carga las credenciales de la
agencia en **Agencia → Motor → Claves** (Google Ads de tu MCC con developer token aprobado; token de un usuario del
sistema de Meta con `ads_read`) y en la ficha del cliente → **Analítica y anuncios** sus IDs de cuenta y el **tope de
gasto mensual** (avisa al 90 %). Detalle: `docs/guia-fases.md`.

### Analítica (GA4 y Search Console)

El rol **Analítica web** (tipo *Informe mensual de analítica*) lee los datos reales del cliente en Google Analytics 4
y Search Console, **solo lectura**, y entrega un PDF: cifras del mes contra el anterior, canales, páginas, búsquedas
en Google, oportunidades (búsquedas casi en primera página) y acciones.

1. Crea una **cuenta de servicio** en Google Cloud (IAM → Cuentas de servicio → Claves → JSON) y activa las APIs
   *Google Analytics Data API* y *Google Search Console API*. Pega el JSON en **Agencia → Motor → Cuenta de servicio
   de Google**. (Un cliente puede usar la suya: ficha del cliente → Analítica.)
2. El cliente da acceso al correo de esa cuenta: GA4 → Administrar → Gestión de acceso → **Lector**; Search Console →
   Configuración → Usuarios y permisos → **Restringido**.
3. En la ficha del cliente → **Analítica**: ID de la propiedad de GA4 (números) y el sitio de Search Console.
4. Para el informe mensual crea una **rutina**: tipo *Informe mensual de analítica*, mensual, **día 3** (Search Console
   tarda 2–3 días en tener los datos).

El motor entrega la credencial y la propiedad **solo** en tareas de ese cliente: el agente no puede pedir datos de
otra propiedad.

### Motores de IA

Cada agente elige su motor en **Agentes → Editar → Modelo de IA**; **Agencia → Modelos de IA** muestra cuáles tienen
sesión en el PC del motor.

| Motor | Con qué entra | Herramientas | Notas |
|---|---|---|---|
| Claude Code | Tu suscripción de Claude | Todas (web, archivos, skills, video, Gmail, Drive…) | Único motor para correo, calendario y crear en Drive. |
| Antigravity | Google AI Pro/Ultra (`agy`) | Web, escribir en `salida/`, **edición de video** (las herramientas del motor) e **imágenes** con su propio generador | Elige el modelo (Gemini, Claude, GPT-OSS) en cada agente. Sin terminal. Sirve para los roles de video e imágenes (en vez de Magnific). No genera video desde cero. |
| Codex | Cuenta de ChatGPT | Escribe en la carpeta de la tarea (sandbox) | |
| Gemini CLI | `GEMINI_API_KEY` | Escribe en la carpeta de la tarea | Clave sin facturación = plan gratis. |
| API | Clave en Modelos de IA | `leer_url` (solo webs públicas), `leer_adjunto` y `escribir_archivo` (solo en `salida/`, el HTML se vuelve PDF) | Para textos y documentos. Si el modelo no acepta herramientas, responde sin ellas. |

- **En paralelo**: una tarea por agente y, por defecto, una por motor (dos por API): `negocio.json → paralelo`, por
  ejemplo `{ "claude": 1, "antigravity": 2, "api": 3 }`. Más paralelo gasta los límites de cada plan más rápido.
- **Respaldo**: si un motor responde "límite de uso" o se detiene por un permiso, la tarea pasa al siguiente
  conectado que sirva para ella (`negocio.json → respaldo`, por defecto `["claude", "antigravity", "codex", "gemini"]`).
  La tarea guarda qué motor la hizo.
- **Consumo de Claude**: elige tu plan en **Agencia → Motor** (Pro, Max o clave de API). Con Pro o Max, el motor
  cuenta sus corridas de Claude en las últimas 5 h y 7 días y, al llegar al umbral (sugerido por plan, ajustable),
  manda las tareas que pueden hacerse sin Claude a los otros motores **antes** de chocar con el límite. Si Claude
  responde "límite de uso", queda en pausa hasta la hora de reinicio que indique. Con Pro, las tareas programadas usan
  primero los otros motores. El medidor aparece en Agencia → Motor, en Modelos de IA y en la Oficina. Con Pro o Max el
  motor quita `ANTHROPIC_API_KEY` del entorno de Claude Code para que nunca cobre por API sin que lo sepas.
- **Privacidad**: en la ficha de cada cliente, **Permite modelos gratis** (desmarcado por defecto). Gemini CLI con
  clave gratis y los proveedores marcados "Plan gratis" solo reciben tareas internas o de clientes con ese permiso.
- Codex, Gemini y Antigravity no leen `motor/CLAUDE.md`: el motor les incluye esas reglas en cada tarea.

### Skills de los agentes

Las skills son paquetes de instrucciones y scripts que hacen a un agente mejor en algo (copywriting, SEO, video,
presentaciones…). Viven en `motor/.claude/skills/` y se asignan a cada agente en **Agentes → Editar → Skills**.

En **Agencia → Skills**:

1. **Buscar**: escribe lo que necesitas ("video", "seo") o pega el link de un repo de GitHub. Los resultados vienen
   de [skills.sh](https://skills.sh); primero salen las **fuentes confiables**. Las instalaciones solo miden
   popularidad, no seguridad: hay repos que copian skills populares.
2. **Revisar**: el motor descarga la skill a una cuarentena **sin ejecutar nada** y te muestra sus archivos, sus
   scripts, los servidores a los que se conectan, los patrones de riesgo que encontró y el `SKILL.md` que leerá el
   agente.
3. **Instalar**: copia exactamente lo que revisaste. Si el repo cambió desde la revisión, te pide revisarla otra
   vez. Con fuente desconocida o alertas, tienes que confirmar que confías en ella.
4. **Buscar actualización** y **Quitar** en la lista de instaladas.

**Curador de skills.** El motor cuenta cuántas veces usa cada skill (aparece en la lista de instaladas). Una vez
por semana, cuando lleva 2 horas sin tareas, revisa las que nadie usa: a los 14 días sin uso pasan a **inactiva**
(solo un aviso) y a los 30 se **archivan** en `motor/skills-archivo/` (dejan de cargarse, no se borran y se
restauran con un clic). Nunca toca las **fijadas** (📌), las asignadas a un agente ni las de clientes con rutinas, y
antes de archivar guarda una copia en `motor/logs/respaldos-skills/`. Viene en **Solo simular**: te informa (aquí y
por Telegram) qué haría, sin mover nada, hasta que lo desactives. Desde la terminal: `node curador.mjs --simular`.

Las fuentes confiables por defecto son `anthropics/skills`, `coreyhaines31/marketingskills`, `heygen-com/hyperframes`,
`remotion-dev/skills` y las de `vercel-labs`. Agrega las tuyas en `motor/negocio.json → fuentesSkills`.

Paquetes recomendados para una agencia:

| Paquete | Para |
|---|---|
| [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | Copies, redes, anuncios, email, lanzamientos, SEO, CRO, estrategia. |
| [anthropics/skills](https://github.com/anthropics/skills) | Word, PowerPoint, Excel, PDF, diseño visual, crear skills propias. |
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | Video, subtítulos, música y voz. Su telemetría se apaga con `HYPERFRAMES_NO_TELEMETRY=1` en `motor/.env`. |
| [Design Skills de typeui.sh](https://www.typeui.sh/design-skills) | Más de 60 estilos para el agente de diseño web (MIT, de sus autores). |

[Remotion](https://github.com/remotion-dev/skills) también hace video, pero exige licencia de pago a empresas de
más de 3 personas.

## Cómo funciona por dentro

```
 Tú y tu equipo (app web o Telegram)      Firebase (gratis)            Tu PC
 ──────────────────────────────────  →  ──────────────────  →  ─────────────────────────────
 crean tareas, aprueban, chatean         tareas, agentes,        motor/ toma las tareas y las
 con los agentes, piden skills           clientes, chats         ejecuta con Claude Code
```

- El motor entra a Firebase con un **usuario robot** con permisos mínimos: solo toca tareas de agentes, responde
  los pedidos de skills y puede dar una tarea de departamento sin tomar a uno de sus agentes. No puede reasignar
  tareas de personas.
- Los agentes solo pueden escribir en la carpeta `salida/` de su tarea y nunca ejecutan comandos. El motor convierte
  a PDF el HTML que dejan ahí, sin JavaScript y sin dejar que la página abra archivos fuera de esa carpeta.
- Cada tarea se trabaja en su propia carpeta `motor/trabajos/<id>`; las entregas quedan en
  `<Cliente>/<Departamento>/<fecha>/v<n>/`.
- Reglas de los agentes (`motor/CLAUDE.md`): nada se publica ni se envía, no inventan datos del cliente y nunca
  piden contraseñas.
- Tus claves viven solo en `motor/.env` y `app/.env`, que nunca se suben a GitHub.

## Archivos de configuración

| Archivo | Qué guarda | ¿Se sube a GitHub? |
|---|---|---|
| `app/.env` | Marca y configuración pública de Firebase | No |
| `motor/.env` | Usuario robot (obligatorio) y, si no las pones en el panel, claves de Telegram y Gemini | **Nunca** |
| `motor/negocio.json` | Tu negocio y tus agentes. Valores por defecto de los ajustes que no definas en **Agencia → Motor** | No |
| `motor/media-config.json` | Entregas: `agenciaDrive` (carpeta sincronizada con Drive), `rcloneRemote` (p. ej. `gdrive:Agencia`), `driveLocal` | No |
| `firestore.rules` | Reglas de seguridad. En el repo lleva `__CORREO_ROBOT__`; `configurar.mjs` pone tu robot | Solo la plantilla |
| `roles/catalogo.json` | Roles: misión, herramientas y forma de entrega | Sí |
| `motor/.claude/skills/` | Skills instaladas y su origen (`skills-origen.json`) | No |
| `motor/skills-archivo/` | Skills archivadas por el curador (se restauran desde el panel) | No |

## Problemas comunes

- **`permission-denied` en el motor**: falta publicar las reglas, o el correo del robot en `firestore.rules` no
  coincide con el de `motor/.env`. Ejecuta `tools/configurar.mjs` y publica con
  `npx firebase-tools deploy --only firestore:rules`.
- **El panel dice que el motor está apagado**: enciéndelo (ver arriba) y espera un minuto.
- **No veo los cambios después de publicar**: recarga con `Ctrl + F5`.
- **El buscador de skills no responde**: el motor debe estar encendido y el PC necesita `git` y salida a internet.
- **Una tarea de departamento no la toma ningún agente**: el departamento necesita al menos un agente activo
  (Agentes → Editar → Departamento).
- **El agente dice que no tiene permiso para una herramienta**: revisa su rol en `roles/catalogo.json` y
  `motor/negocio.json → agentes[id]`.
- **"No se pudo crear el PDF"**: en Linux/WSL faltan librerías del navegador
  (`sudo apt-get install -y libnss3 libnspr4 libasound2t64`), o define `navegador` en `motor/media-config.json`
  con la ruta de Chrome.
- **Telegram no conecta**: algunas redes bloquean api.telegram.org; el motor reintenta solo.

## Estructura

```
app/        App web (React, Vite, Three.js, Firebase)
motor/      Motor local de agentes (Node + Claude Code): worker, skills, Telegram, voz, medios
roles/      Catálogo de roles y herramientas
tools/      Configurador e inicio automático
.claude/    Skill /instalar
```

## Licencia

MIT. Usa, modifica y comparte libremente. Los nombres y marcas de terceros pertenecen a sus dueños;
el proyecto no incluye personajes con marca registrada: cada negocio nombra a sus agentes.
