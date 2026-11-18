// Candado de un solo motor por PC: dos motores a la vez tomarían las mismas tareas y chocarían en los puertos.
// logs/motor.lock guarda el PID del motor que corre. Se crea de forma atómica (flag 'wx'); si ya existe y ese PID
// sigue vivo y es un motor, el segundo no arranca. Si el dueño murió sin limpiar (apagón, kill -9), se reemplaza.
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs'

// El launcher para de reintentar con este código de salida
export const SALIDA_YA_HAY_MOTOR = 3

// ¿Ese PID es un motor vivo? En Linux se mira su línea de comando (un PID se puede reutilizar, sobre todo en Docker,
// donde el motor suele tener siempre el mismo); en otros sistemas basta con que el proceso exista.
export function esMotorVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0) } catch (e) { if (e.code !== 'EPERM') return false }
  const cmd = `/proc/${pid}/cmdline`
  if (existsSync('/proc/self')) {
    try { return readFileSync(cmd, 'utf8').includes('worker.mjs') } catch { return false }
  }
  return true
}

export function tomarCandado(ruta, { pid = process.pid, vivo = esMotorVivo } = {}) {
  for (let intento = 0; intento < 2; intento++) {
    try {
      writeFileSync(ruta, String(pid), { flag: 'wx' })
      return { ok: true }
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
    }
    const otro = Number.parseInt(readFileSync(ruta, 'utf8').trim(), 10)
    // Mi propio PID (contenedor reiniciado) o un dueño muerto: candado viejo
    if (Number.isInteger(otro) && otro !== pid && vivo(otro)) return { ok: false, pid: otro }
    try { unlinkSync(ruta) } catch { /* otro lo borró a la vez: se reintenta */ }
  }
  return { ok: false, pid: null }
}

// Solo lo suelta quien lo tiene (si otro motor ya lo tomó, no se le borra)
export function soltarCandado(ruta, { pid = process.pid } = {}) {
  try {
    if (Number.parseInt(readFileSync(ruta, 'utf8').trim(), 10) === pid) unlinkSync(ruta)
  } catch { /* no había candado */ }
}
