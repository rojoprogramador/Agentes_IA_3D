# Agentes IA 3D

> Si eres un agente de IA ejecutando una tarea del motor (tu carpeta de trabajo está dentro de `motor/trabajos/`),
> ignora este archivo: tus reglas están en `motor/CLAUDE.md` y en el texto de tu tarea.

Proyecto de código abierto: una oficina 3D con agentes de IA para cualquier negocio.

- `app/` — app web (React + Vite + Three.js + Firebase): Pipeline de tareas, Oficina 3D, chat con agentes, equipo.
- `motor/` — motor local (Node): toma las tareas de los agentes y las ejecuta con Claude Code; Telegram, voz, medios.
- `roles/catalogo.json` — catálogo de roles (habilidades) que comparten la app y el motor.
- **Agencia** (multi-cliente): colecciones `clients` (ficha de contexto por cliente), `departments` y `taskTypes`
  (plantilla de brief, checklist y rol revisor). Las tareas guardan `clienteId`, `departamentoId`, `tipoTareaId`,
  `brief`, `briefCampos`, `versiones`, `revisionAgente` y `driveSync`/`drivePath`/`driveUrl`. Se conserva el campo
  `cliente` (nombre) para tareas viejas. Pantallas: Clientes (ficha), Agencia (departamentos y tipos), panel de
  revisión en la tarea (`ReviewPanel`).
- En el motor, `motor/agencia.mjs` arma la ficha y el brief (funciones puras, `npm test` en `motor/`). Regla: un
  agente solo recibe la ficha del cliente de su tarea; el coordinador, en una tarea de cliente, solo ve las tareas
  de ese cliente.
- Versiones y Drive: cada entrega queda en `<agenciaDrive>/<Cliente>/<Departamento>/<fecha tarea>/v<n>/` y al aprobar
  se copia a `<Cliente>/Aprobados/`. `agenciaDrive` (carpeta sincronizada con Google Drive) y `rcloneRemote` van en
  `motor/media-config.json`; sin configurar, todo queda en `motor/agencia/`.
- Modelos de IA: Claude Code por defecto. En Agencia → Modelos de IA se agregan proveedores con API compatible con
  OpenAI (`providers/{id}`); la clave va en `providerSecrets/{id}`, que el panel escribe pero solo el motor lee.
  Un agente con `modelo = { proveedor: 'api', proveedorId, nombre }` usa ese modelo (solo texto). Los roles con
  `modelo.requiereHerramientas` y los tipos de tarea de video/archivos/código siempre van con Claude Code.
  `modelo.proveedor = 'alterno'` usa `ALT_LLM_*` de `motor/.env`.
- Skills por agente (`agents.skills`): el motor publica las skills instaladas en `config/agentWorker.skills`.
  Lecciones por agente (`agents.aprendizajes`) y por cliente (`clients.aprendizajes`) se agregan desde la revisión.
- Buscador de skills (Agencia → Skills): el panel crea pedidos en `skillOps` (buscar, revisar, instalar, actualizar,
  desinstalar) y solo el motor los responde (`motor/skills.mjs`). Busca en skills.sh o en un repo de GitHub, descarga a
  `motor/.skills-cuarentena/`, analiza sin ejecutar nada e instala en `motor/.claude/skills/` solo la revisión aprobada
  (mismo commit). El origen de cada skill queda en `motor/.claude/skills-origen.json`. Fuentes confiables:
  `FUENTES_BASE` + `negocio.json → fuentesSkills`.
- Tareas de departamento: `asignado: ''` + `paraDepartamento: true` + `departamentoId`. Las personas tienen
  `users.departamentoId`. La toma quien llegue primero; si nadie del equipo humano la toma en
  `negocio.json → esperaDepartamentoMin` (30 min), el motor se la da a un agente del departamento.
  Agencia → Tareas muestra la misma colección `tasks` agrupada por departamento.
- Entregables con vista previa: los roles con el grupo `salida` (`roles/catalogo.json`) pueden escribir solo en
  `./salida/` de su tarea (`Write(./salida/**)`). Al terminar, `motor/entregables.mjs` convierte cada HTML de
  `salida/` en PDF con Chromium (sin JavaScript, solo archivos de esa carpeta e imágenes/fuentes por https) y guarda
  imágenes de las páginas en `previews/{taskId}`. `ReviewPanel` las muestra; `entregaDrive` guarda los links de Drive.
- Permisos por tarea: `toolsFor(agent, t)` = grupos del rol + `taskTypes.herramientas` + `tasks.permisosExtra`
  (`permisosDeTarea` en `motor/agencia.mjs`, solo nombres de grupos del catálogo). Solo un admin puede poner o cambiar
  `permisosExtra` (reglas `sinPermisosNuevos` / `mismosPermisos`). Una tarea con permisos extra siempre va a Claude Code.
- Tareas programadas: colección `schedules` ({nombre, activo, regla, plantilla, proximaEjecucion, ultimaTareaId,
  totalCreadas}). Cálculo de fechas en `motor/programadas.mjs` (puro, con pruebas; el panel lo importa).
  `revisarProgramadas()` corre cada minuto: crea la tarea con `programadaId`, calcula la próxima desde AHORA (sin
  atrasadas acumuladas) y se salta si la anterior sigue pendiente. El coordinador crea rutinas con el bloque
  ```programar```. Reglas: el robot solo crea tareas que coinciden con su rutina (`esDeRutina`) y solo actualiza
  las marcas de ejecución.
- Motores (`motor/motores.mjs`): `agents.modelo.proveedor` = `claude` | `antigravity` (+`nombre` = modelo de agy) |
  `codex` | `gemini` | `api`. `runModel` prueba el principal y luego `negocio.json → respaldo` si hay límite de uso o
  permiso denegado. `enCurso` (Map) + `negocio.json → paralelo` = cupos por motor, una tarea por agente.
  `permiteGratis(t)`: Gemini gratis y `providers.gratis` solo con `clients.permiteModelosGratis` o sin cliente.
  Antigravity: instrucción en `.instrucciones-agente.md`, permisos en `.agy-ajustes.json`
  (`write_file(<tarea>/salida)`, `deny command(*)`); en `/tmp` agy escribe en cualquier lado, por eso las tareas
  viven en `motor/trabajos/`.
- Configuración desde el panel (Agencia → Motor, `app/src/pages/AgenciaMotor.jsx`): ajustes en `config/motor`
  (`paralelo`, `respaldo`, `esperaDepartamentoMin`, `zonaHoraria`, `fuentesSkills`, `modeloAntigravity`, `geminiDePago`,
  `telegramOwnerId`) y claves en `secretos/{NOMBRE}` (`{ valor }`, escribe el admin, solo lee el robot). En el motor,
  `ajustes()` = `negocio.json` + lo que defina el panel, y `secreto(k)` = panel o `motor/.env`; se escuchan en vivo y
  Telegram se reinicia si cambia su token. El latido publica `secretos` (origen: panel/env/null, nunca el valor) y
  `ajustesEfectivos`. Para una clave nueva: agrégala a `SECRETOS` (worker) y `SECRETOS_MOTOR` (panel).
- Detener tareas: el panel escribe `tasks.cancelar = true` (+ `cancelarPor`) y Telegram usa `/parar`. Todos los motores
  lanzan sus procesos con `motor/procesos.mjs` (`lanzar` en su propio grupo, registrados por carpeta de trabajo);
  `detenerTarea` mata todo lo de `trabajos/<id>` con sus hijos (servidores MCP incluidos), `runModel` no pasa al respaldo
  y `terminarCancelada` deja la tarea en `pendiente` con `agentStatus: 'cancelada'`, que `eligible` ignora hasta que
  alguien la reanude (`agentStatus: 'queued'`).
- Consumo de Claude (`motor/consumo.mjs`, puro con pruebas): `runClaude` registra cada corrida en
  `logs/consumo-claude.json`; `estadoClaude()` compara con `ajustes().planClaude` / `limitesClaude` (por defecto
  `LIMITES_PLAN`) y con `bloqueadoHasta` (hora de reinicio del mensaje de límite). `cadenaMotores()` pasa Claude al final
  si está saturado o si es tarea programada con Pro (`programadasPrimeroOtros`), salvo `soloClaude`; `pump` cuenta cupos
  con `primerMotor()`. El latido publica `consumoClaude` (`MedidorClaude.jsx`). Plan `api` usa `secretos/ANTHROPIC_API_KEY`;
  con Pro/Max se borra `ANTHROPIC_API_KEY` del entorno del hijo.
- Antigravity con medios: si la tarea tiene herramientas `mcp__agentes-media__*`, `correrMotor` declara el servidor de
  medios como plugin del proyecto en `<tarea>/.agents/plugins/agentes-media/` (se borra al terminar) y permite cada
  herramienta con `mcp(agentes-media_agentes-media/<herramienta>)`. Las imágenes de su generador quedan en
  `~/.gemini/antigravity-cli/brain/<conversation_id>/` y `copiarImagenesAgy` las copia a `salida/`. En el worker:
  `soloClaude` = grupos que ni Antigravity tiene (Gmail, calendario, crear en Drive, MCP extra); `sinHerramientasMcp`
  decide Codex y Gemini (`GRUPOS_ANTIGRAVITY` = entregas, editor_video, magnific_imagenes).
- Memoria con límite (`motor/memoria.mjs`, puro con pruebas; el panel lo importa): `agents.aprendizajes` y
  `clients.aprendizajes` (2.200) y `config/perfilDueno.entradas` (1.375). `agregarEntrada` falla si no cabe (hay que
  consolidar), `revisarEntrada` rechaza claves, Unicode invisible, inyección y enlaces de exfiltración, y
  `bloqueMemoria` arma el bloque del prompt con el uso. Editor: `MemoriaEditor.jsx`.
- Historial buscable (`motor/historial.mjs`, con pruebas): SQLite de Node (`node:sqlite`) + FTS5 en
  `motor/logs/historial.db`, tabla `mensajes(cliente_id, tarea_id, tarea, agente_id, rol, ts, texto, huella)` con
  `huella` única (registrar es idempotente). El worker anota con `anotar(t, rol, texto)` (brief, entrega, revision,
  correccion, pregunta, respuesta) y `llenarHistorial()` carga todas las tareas al arrancar. Herramienta MCP
  `buscar_historial` (`media-server.mjs`, grupo `historial`, va en toda tarea): el cliente NO es parámetro, llega en
  `AGENTES_CLIENTE` (y `AGENTES_TAREA` para excluirla) que `runClaude` y el plugin de Antigravity ponen al lanzar;
  sin esa variable la herramienta se niega. Tareas sin cliente = `__interno__`. Las claves se redactan
  (`CREDENCIAL` de `memoria.mjs`) y la consulta se reduce a palabras entre comillas (`consultaSegura`).
- Aprendizaje propuesto (`motor/aprendizaje.mjs`, puro con pruebas): al aprobar (`driveSync: 'pendiente'`)
  `encolarAprendizaje` → `revisarAprendizaje` si `motivoRevision` (rechazo, corrección, notas del revisor o
  `costo.turnos ≥ minTurnos`); una vez por tarea (`logs/aprendizaje-revisadas.json`), en cola. `correrRevisorAprendizaje`
  usa `config/motor.aprendizaje.proveedorId` (API) y luego los CLI sin Claude (salvo `conClaude`), con
  `opts.sinHerramientas`. `parsearPropuestas` valida con `revisarEntrada`; se crean `propuestas/{id}`
  `{ tipo: memoria|skill, destino, texto|skill+markdown, estado }`. Panel: `PropuestasAprendizaje.jsx` (arriba del
  Pipeline): memoria → `agregarEntrada` en la ficha; skill → `estado: 'aprobada'` y el motor escribe el SKILL.md
  (`instalarSkillPropuesta`, `rutaSkill`): global en `motor/.claude/skills/` (origen `local` en skills-origen.json),
  de cliente en `motor/skills-clientes/<clienteId>/`, copiada a `trabajos/<id>/.claude/skills/` solo en sus tareas
  (`copiarSkillsDeCliente`; verificado que Claude Code las carga). Reglas: el robot crea en `pendiente` y solo pasa
  una skill aprobada a `instalada`/`error`; el admin no puede cambiar `tipo` ni `destino`.
- Curador de skills (`motor/curador.mjs`, puro con pruebas). `runClaude` usa `--output-format stream-json --verbose`
  (la última línea sigue siendo el resultado); `skillsUsadas` cuenta `tool_use` Skill y Read de `.claude/skills/<n>/SKILL.md`
  → `logs/skills-uso.json` (clave `nombre` o `<clienteId>/<nombre>`). `revisarCurador` (cada minuto): semanal y con
  el motor libre ≥2 h. `planCuracion`: el reloj parte de `max(ultimoUso, vistaDesde, instalada)`; 14 días → `inactiva`
  (solo marca), 30 → `archivar` (mueve a `motor/skills-archivo/<_global|clienteId>/`, con `.archivada.json`). Protegidas:
  `config/curador.fijadas`, `agents.skills` y skills de clientes con rutinas activas. Respaldo tar.gz previo
  (`logs/respaldos-skills/`, últimos 8). `config/curador.simular` (por defecto true) solo informa. skillOps `curar`
  (siempre simulación desde el panel) y `restaurar`. Heartbeat: `curador` (informe, archivadas) y `usos` por skill.
- Aprobación de acciones (`motor/aprobaciones.mjs`, puro con pruebas). `runClaude` separa con `separarHerramientas`
  las de `catalogo.json → accionesConAprobacion` (SENSIBLES_BASE si falta): fuera de `--allowedTools`, con
  `--disallowedTools Bash` y `--permission-prompt-tool mcp__agentes-media__pedir_aprobacion`. Esa herramienta
  (media-server.mjs) hace POST a un servidor HTTP del worker en 127.0.0.1 (token por encendido, env
  `AGENTES_APROBACION_URL/TOKEN`, `AGENTES_EJECUCION`); ante cualquier fallo deniega. `resolverPermiso`: `decisionPrevia`
  (no es de esta ejecución → denegar; Drive create_file con `parentId` = carpeta del agente → permitir; siempre/tarea →
  permitir; programada → denegar) y si no, crea `aprobaciones/{id}` + Telegram con botones (`apr:<id>:<alcance>`,
  `onCallback`) y espera 5 min (`caducada`). Decisión desde el panel (`AprobacionesPendientes.jsx`, en App.jsx) o
  Telegram. "Siempre" → `config/permisosAcciones.siempre` (el robot puede escribir ese doc). `MCP_TOOL_TIMEOUT` se sube
  para que la espera no corte la llamada. Al arrancar, las `pendiente` viejas pasan a `caducada`.
- SEO técnico y QA (B5): `motor/auditoria.mjs` (puro con pruebas: `urlAuditable`/`esIpPrivada` anti-SSRF, robots,
  sitemap, `revisarSchema`, `resumirPageSpeed`, `resumirAxe`, `problemasPagina`, `crearCola`) y
  `motor/auditoria-server.mjs` (MCP `agentes-auditoria`: pagespeed, rastrear_sitio, accesibilidad, robots_y_sitemap,
  datos_estructurados, capturas). Usa el Chromium de `buscarNavegador` + puppeteer-core y `axe-core`; cada URL y
  redirección se resuelve por DNS y se rechaza si es privada; IPv4 primero (WSL). `runClaude` lo declara con
  `--mcp-config logs/mcp-auditoria.json` si hay herramientas `mcp__agentes-auditoria__*` y pasa `PAGESPEED_API_KEY`
  (secreto del panel). Grupo `auditoria` (solo Claude), roles `seo_tecnico` y `qa`, tipos `auditoria_seo` y `qa_sitio`.
- Seguridad pasiva (B6): `motor/seguridad.mjs` (puro con pruebas: `TIPOS`, `IMAGENES` con versión fija,
  `alcanceVigente` (firmante, documento, vigencia ≤ 90 días, ventana solo para tipos `vivo`), `objetivoEnAlcance`
  (repos normalizados, dominios con `*.`/subdominios, IPs y CIDR ≥ /8), `argsDocker` (--rm, --cap-drop ALL,
  no-new-privileges, --read-only, tmpfs, uid del PC, --cpus 1, --memory 2g, --pids-limit 256, --network none si no hace
  falta), lectores gitleaks/osv/semgrep/trivy/testssl/zap → formato común con OWASP Top 10:2025, `candadoLibre`).
  `motor/seguridad-server.mjs` (MCP `agentes-seguridad`: `ver_alcance`, `run_scan`; clona el repo en la tarea, candado
  `logs/seguridad.lock`, registro `logs/seguridad-registro.jsonl`). El worker lo declara con `--mcp-config` y pasa
  `AGENTES_ALCANCE` = `clients.alcanceAutorizado` del cliente de la tarea. `run_scan` está en `accionesConAprobacion`.
  Rol `auditor_seguridad`, grupo `seguridad` (solo Claude), tipo `analisis_repo`. Ficha → Alcance ampliada.
- Analítica (B7): `motor/analitica.mjs` (puro con pruebas: cuenta de servicio, JWT RS256 con `node:crypto`, fechas y
  periodo anterior, cuerpos y filas de GA4 Data API y Search Console, comparación, oportunidades) y
  `motor/analitica-server.mjs` (MCP `agentes-analitica`: estado_analitica, ga4_resumen, ga4_reporte, gsc_rendimiento,
  gsc_oportunidades; sin dependencias de Google). El worker pasa `AGENTES_GOOGLE_SA` (`secretos/cliente_<id>_google` o
  `GOOGLE_ANALITICA_SA`), `AGENTES_GA4_PROPIEDAD` y `AGENTES_GSC_SITIO` desde `clients.analitica` del cliente de la
  tarea. Latido: `analitica { cuentaAgencia, clientes }` (solo correos). Rol `analista`, grupo `analitica`, tipo
  `informe_analitica` (rutina mensual día 3). URLs de Google cambiables por env solo para pruebas.
- Herramientas para modelos por API (B8): `motor/herramientas-api.mjs` (con pruebas): `herramientasPara(grupos)` (web →
  leer_url; archivos → listar_adjuntos/leer_adjunto; salida → escribir_archivo), `crearEjecutor` (leer_url con
  `urlAuditable` + DNS en cada redirección y HTML→texto; adjuntos solo en `adjuntos/` y de texto; escribir solo nombres
  simples y extensiones de texto en `salida/`, máx. 20 archivos de 2 MB), `bucleHerramientas` (máx. 10 pasos y luego
  respuesta final con `tool_choice: none`), `crearLlamada` y `responder` (si el proveedor rechaza `tools`, repite sin
  ellas). `runApi(cfg, prompt, { cwd, grupos })` en el worker; `needsTools` ya no manda a Claude las tareas cuyos grupos
  están en `GRUPOS_API` (y `formatoEntrega: archivos` solo si la tarea no tiene `salida`).
- WhatsApp (B9): `motor/whatsapp.mjs` (con pruebas: `verificarFirma` HMAC-SHA256 con app secret, verificación GET,
  `extraerMensajes`, `partirTexto`, ventana de 24 h, código de emparejamiento, cliente Graph `enviarTexto/marcarLeido/
  descargarMedio`, `crearServidorWebhook`) y `motor/tunel.mjs` (`cloudflared` quick tunnel o con
  `CLOUDFLARE_TUNNEL_TOKEN`; reintento con espera creciente). Worker: `reiniciarWhatsApp` (firma de config; puerto
  `config/motor.whatsapp.puerto`, 8790), `atenderWhatsApp`: desconocido/pendiente → código (1 respuesta/h) en
  `whatsappContactos/{numero}`; `rol: dueno` → `handleTelegram(texto, 'WhatsApp')`; `rol: cliente` →
  `whatsappMensajes` (entrante) + historial (`rol: 'whatsapp'`) + aviso por Telegram; nunca responde un agente.
  Respuestas del panel: `whatsappMensajes` saliente `pendiente_envio` → `enviarDesdePanel`. Panel: Agencia → WhatsApp
  (`AgenciaWhatsApp.jsx`) y tarjeta en Motor. Secretos `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `CLOUDFLARE_TUNNEL_TOKEN`.
- Paid media (C1): `motor/ads.mjs` (puro con pruebas) y `motor/ads-server.mjs` (MCP `agentes-ads`: estado_ads,
  ads_auditoria, ads_terminos_busqueda; solo lectura, sin herramientas de cambio). `entornoPorCliente` (worker) junta lo
  que se inyecta por cliente (B6, B7, C1): `secretos/cliente_<id>_googleads|metaads` o `GOOGLE_ADS_CRED`/`META_ADS_TOKEN`,
  `clients.ads {googleAdsCustomerId, metaAdAccountId, topeMensual}`. Rol `paid_media`, grupo `ads`, tipo `auditoria_ads`.
  Explicación de cada fase C/D: `docs/guia-fases.md`.
- Email (C2): `motor/email.mjs` + `motor/email-server.mjs` (MCP `agentes-email`: email_listas, email_campanas,
  email_crear_borrador; sin envío). `config/motor.email.listmonkUrl`, secreto `LISTMONK_API`, `clients.email.listas`.
  Rol `email_marketing`, grupo `email`, tipo `secuencia_email`. CRM: MCP de HubSpot/Twenty vía `herramientasExtra`.
- Seguridad: plantilla de autorización en `docs/plantillas/autorizacion-pruebas-seguridad.md` (requisito de B6).
- `firestore.rules` — reglas de seguridad. `tools/configurar.mjs` las personaliza.
- `.claude/skills/instalar/` — asistente de instalación.

## Si la persona quiere instalarlo o configurarlo

Usa la skill **instalar** (`/instalar`). Si `app/.env` o `motor/negocio.json` no existen, el proyecto aún no está
instalado: ofrece empezar la instalación.

## Reglas para trabajar en este repo

- Nunca leas, muestres ni subas `motor/.env`, `app/.env`, `motor/negocio.json` ni contraseñas o tokens.
- Nada específico de un negocio va en el código: va en `.env`, `motor/negocio.json` o `roles/catalogo.json`.
- Los textos de la interfaz están en español.
- Para agregar una habilidad nueva, crea un rol en `roles/catalogo.json` (misión, herramientas, entrega).
