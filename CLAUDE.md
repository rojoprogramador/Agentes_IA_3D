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
