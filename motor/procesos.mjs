// Procesos de los motores (Claude Code, Codex, Gemini, Antigravity) agrupados por carpeta de trabajo,
// para poder detener una tarea en curso. Cada tarea trabaja en motor/trabajos/<id>, así que detenerla es
// matar todo lo que se lanzó en esa carpeta, con sus hijos (Claude lanza servidores MCP, por ejemplo).

import { spawn } from 'node:child_process'
import { resolve, sep } from 'node:path'

const IS_WIN = process.platform === 'win32'
const porCarpeta = new Map() // carpeta → Set<proceso>

// Igual que spawn, pero en su propio grupo de procesos (en Windows se usa taskkill /T) y registrado por carpeta
export function lanzar(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { ...opts, detached: !IS_WIN })
  const carpeta = opts.cwd ? resolve(opts.cwd) : ''
  if (carpeta && child.pid) {
    if (!porCarpeta.has(carpeta)) porCarpeta.set(carpeta, new Set())
    porCarpeta.get(carpeta).add(child)
    const quitar = () => {
      const s = porCarpeta.get(carpeta)
      s?.delete(child)
      if (s && !s.size) porCarpeta.delete(carpeta)
    }
    child.on('close', quitar)
    child.on('error', quitar)
  }
  return child
}

// Mata el proceso y todos sus hijos. Primero pide que termine; a los 5 s lo fuerza.
export function matar(child) {
  if (!child?.pid || child.exitCode !== null) return
  if (IS_WIN) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => {})
    return
  }
  const senal = (s) => { try { process.kill(-child.pid, s) } catch { try { child.kill(s) } catch {} } }
  senal('SIGTERM')
  setTimeout(() => { if (child.exitCode === null) senal('SIGKILL') }, 5000).unref()
}

// Mata todo lo que corre en una carpeta (o dentro de ella). Devuelve cuántos procesos había.
export function matarEn(carpeta) {
  const base = resolve(carpeta)
  let n = 0
  for (const [c, procs] of porCarpeta) {
    if (c !== base && !c.startsWith(base + sep)) continue
    for (const p of procs) { matar(p); n++ }
  }
  return n
}

export function matarTodos() {
  for (const procs of porCarpeta.values()) for (const p of procs) matar(p)
}
