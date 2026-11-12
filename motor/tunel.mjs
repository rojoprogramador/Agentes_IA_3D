// Túnel de Cloudflare para el webhook de WhatsApp (fase B9). Publica en internet SOLO el puerto local del webhook.
//   - Con token (CLOUDFLARE_TUNNEL_TOKEN): túnel con nombre y URL fija (la configuras en Cloudflare → Zero Trust →
//     Tunnels, apuntando a http://localhost:<puerto>). Es lo recomendado: la URL de Meta no cambia.
//   - Sin token: "quick tunnel" gratis con una URL https://<algo>.trycloudflare.com que CAMBIA en cada encendido
//     (sirve para probar; hay que actualizar la URL en Meta cada vez).
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, delimiter } from 'node:path'
import os from 'node:os'

export function buscarCloudflared(ROOT) {
  const exe = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
  const dirs = [join(ROOT, 'bin'), join(os.homedir(), '.local', 'bin'), ...String(process.env.PATH || '').split(delimiter),
    'C:\\Program Files (x86)\\cloudflared', 'C:\\Program Files\\cloudflared']
  for (const d of dirs) { const p = join(d, exe); if (d && existsSync(p)) return p }
  return null
}

// URL pública que imprime el quick tunnel
export const urlDeSalida = (texto) => String(texto || '').match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] || null

export function crearTunel({ ROOT, puerto, token = '', urlFija = '', log }) {
  let proc = null, parado = false, url = urlFija || null, estado = 'apagado', reintentos = 0, temporizador = null
  const exe = buscarCloudflared(ROOT)

  function arrancar() {
    if (parado) return
    if (!exe) { estado = 'sin cloudflared'; log('WhatsApp: falta cloudflared (instálalo: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)'); return }
    const args = token
      ? ['tunnel', '--no-autoupdate', 'run', '--token', token]
      : ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${puerto}`]
    estado = 'conectando'
    proc = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const leer = (d) => {
      const s = String(d)
      const u = !token && urlDeSalida(s)
      if (u && u !== url) { url = u; log(`🌐 Túnel de WhatsApp: ${url}/whatsapp  (quick tunnel: cambia en cada encendido)`) }
      if (/Registered tunnel connection|Connection [a-f0-9-]+ registered/i.test(s)) { estado = 'conectado'; reintentos = 0 }
    }
    proc.stdout.on('data', leer); proc.stderr.on('data', leer)
    proc.on('error', e => { estado = 'error'; log('WhatsApp: no pude arrancar cloudflared:', e.message) })
    proc.on('close', (code) => {
      proc = null
      if (parado) return
      estado = 'caído'
      if (!token) url = null
      const espera = Math.min(5 * 60_000, 5000 * 2 ** reintentos++)
      log(`WhatsApp: el túnel se cerró (código ${code}); reintento en ${Math.round(espera / 1000)} s`)
      temporizador = setTimeout(arrancar, espera)
    })
  }

  arrancar()
  return {
    estado: () => ({ estado, url: url ? `${url.replace(/\/$/, '')}/whatsapp` : null, conToken: !!token, cloudflared: !!exe }),
    parar: () => { parado = true; clearTimeout(temporizador); try { proc?.kill() } catch {} },
  }
}
