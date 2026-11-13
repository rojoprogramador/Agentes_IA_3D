# Motor en un servidor (VPS)

El motor normalmente corre en tu PC. Si quieres que trabaje 24/7 (rutinas de madrugada, WhatsApp y alertas siempre
disponibles) puedes llevarlo a un servidor con Docker. La app (el panel) no cambia: sigue en Firebase Hosting.

## Antes de empezar: el plan de Claude

| Cómo autenticas Claude Code | ¿Sirve en el servidor? |
|---|---|
| **Claude Pro** | No conviene. Sus límites son para uso personal; una cola desatendida 24/7 los agota y Anthropic puede limitar la cuenta. Usa Pro en tu PC. |
| **Claude Max** | Sí. Genera un token de larga duración en tu PC con `claude setup-token` y ponlo en `motor/.env` como `CLAUDE_CODE_OAUTH_TOKEN`. |
| **Clave de API** (pago por uso) | Sí, es lo más predecible. En el panel: Agencia → Motor → plan "Clave de API" y la clave en Claves. |

Los demás motores (Antigravity, Codex, Gemini CLI) también necesitan iniciar sesión en el servidor; los modelos por API
(Agencia → Modelos de IA) funcionan igual que en el PC.

## Servidor recomendado

- 2 vCPU, **4 GB de RAM** (Chromium para PDF y auditorías) y 40 GB de disco (la imagen pesa unos 9 GB: Chromium,
  los CLI de los motores y el modelo de transcripción de voz). Ubuntu 24.04.
- Docker y Docker Compose: `curl -fsSL https://get.docker.com | sh` (o el paquete `docker.io` de Ubuntu).
- No hace falta abrir puertos: WhatsApp y las alertas entran por el túnel de Cloudflare (sale del servidor hacia
  Cloudflare). Deja abierto solo SSH.

## Pasos

```bash
git clone https://github.com/<tu-usuario>/Agentes_IA_3D.git && cd Agentes_IA_3D
cp motor/.env.example motor/.env          # correo y contraseña del robot (lo demás se carga desde el panel)
cp <tu negocio.json> motor/negocio.json   # o créalo con el asistente /instalar en tu PC y súbelo
docker compose up -d --build
docker compose logs -f motor              # debe decir "Motor encendido"
```

Iniciar sesión de Claude Code dentro del contenedor (si no usas `CLAUDE_CODE_OAUTH_TOKEN` ni clave de API):

```bash
docker compose exec motor npx claude      # sigue las instrucciones; la sesión queda en el volumen claude-sesion
```

## Qué queda dónde

| Volumen | Contenido |
|---|---|
| `motor-logs` | Registros, historial (`historial.db`), estado del curador, GEO, alertas, registro de seguridad |
| `motor-trabajos` | Carpeta de trabajo de cada tarea |
| `motor-entregas` | Archivos entregados por los agentes |
| `motor-skills`, `motor-skills-clientes`, `motor-skills-archivo` | Skills instaladas, de clientes y archivadas |
| `claude-sesion` | Sesión de Claude Code |

Copia de seguridad: `docker run --rm -v agentes_ia_3d_motor-logs:/d -v $PWD:/b alpine tar czf /b/logs.tgz -C /d .`
(repite por volumen).

## Actualizar

```bash
git pull && docker compose up -d --build
```

## Lo que NO funciona igual en el contenedor

- **Escaneos de seguridad (B6/C5)**: necesitan Docker, y darle al contenedor acceso a Docker (`/var/run/docker.sock`)
  equivale a darle control total del servidor. Si los necesitas, corre el motor sin contenedor en el servidor
  (`cd motor && npm install && node worker.mjs` con un servicio de systemd) o deja la seguridad en tu PC.
- **Notas de voz** (Telegram/WhatsApp): descargan un modelo de transcripción la primera vez (unos cientos de MB).
- **Google Drive y Gmail de Claude**: son conectores de tu cuenta de Claude; con clave de API no están disponibles.
