import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { lanzar, matarEn } from './procesos.mjs'

const vivo = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
const esperar = (ms) => new Promise(r => setTimeout(r, ms))

test('matarEn detiene los procesos de la carpeta de la tarea, con sus hijos, y no los de otra', { skip: process.platform === 'win32' }, async () => {
  const raiz = mkdtempSync(join(os.tmpdir(), 'procesos-'))
  const tareaA = join(raiz, 'a'), tareaB = join(raiz, 'b')
  mkdirSync(tareaA); mkdirSync(tareaB)
  try {
    // Como Claude Code: un shell que lanza un hijo de larga duración
    const a = lanzar('sh', ['-c', 'sleep 30 & echo $!; wait'], { cwd: tareaA })
    const b = lanzar('sleep', ['30'], { cwd: tareaB })
    const nieto = await new Promise(r => a.stdout.once('data', d => r(Number(String(d).trim()))))
    const cerradoA = new Promise(r => a.on('close', r))
    assert.ok(vivo(nieto))

    assert.equal(matarEn(tareaA), 1)
    await cerradoA
    await esperar(200)
    assert.equal(vivo(nieto), false, 'el hijo del shell también debe morir')
    assert.equal(b.exitCode, null, 'la otra tarea sigue trabajando')

    assert.equal(matarEn(join(raiz, 'no-existe')), 0)
    matarEn(tareaB)
    await new Promise(r => b.exitCode !== null ? r() : b.on('close', r))
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
})
