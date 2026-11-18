import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import ffprobeStatic from 'ffprobe-static'
import ffmpegPath from 'ffmpeg-static'
import { spawnSync } from 'node:child_process'
import { idDeDrive, linksDeDrive, nombreFinal, nombreCliente, temaCorto, formatoPorTamano, nombreIntermedio, pareceTexto, validarVideo } from './video.mjs'

test('drive: ids de archivo y carpeta; otros links no', () => {
  assert.deepEqual(idDeDrive('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing'), { tipo: 'archivo', id: '1AbCdEfGhIjKlMnOp' })
  assert.deepEqual(idDeDrive('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp'), { tipo: 'archivo', id: '1AbCdEfGhIjKlMnOp' })
  assert.deepEqual(idDeDrive('https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp'), { tipo: 'archivo', id: '1AbCdEfGhIjKlMnOp' })
  assert.deepEqual(idDeDrive('https://drive.google.com/drive/folders/1FolderIdXYZ123?usp=drive_link'), { tipo: 'carpeta', id: '1FolderIdXYZ123' })
  assert.equal(idDeDrive('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit'), null)
  assert.equal(idDeDrive('https://evil.com/file/d/1AbCdEfGhIjKlMnOp'), null)
  assert.equal(idDeDrive('no es url'), null)
})

test('drive: junta los links de la tarea sin repetir', () => {
  const t = {
    links: 'Recursos: https://drive.google.com/file/d/1AAAAAAAAAAA/view',
    briefCampos: { video: 'https://drive.google.com/file/d/1AAAAAAAAAAA/view?usp=sharing', formato: 'vertical' },
    descripcion: 'otro (https://drive.google.com/drive/folders/1BBBBBBBBBBB) y https://youtube.com/x',
  }
  assert.deepEqual(linksDeDrive(t).map(l => `${l.tipo}:${l.id}`), ['archivo:1AAAAAAAAAAA', 'carpeta:1BBBBBBBBBBB'])
  assert.deepEqual(linksDeDrive({}), [])
})

test('nombres: final limpio, sin pasos ni sufijos', () => {
  assert.equal(nombreCliente('Plomeros SAOR'), 'PlomerosSAOR')
  assert.equal(nombreCliente('plomería ñandú'), 'PlomeriaNandu')
  assert.equal(temaCorto('Cómo destapar un lavaplatos en Cali (video corto) 2026'), 'destapar-lavaplatos-cali')
  assert.equal(nombreFinal({ cliente: 'Plomeros SAOR', tema: 'Destapar lavaplatos', formato: 'short', n: 2 }), 'PlomerosSAOR_destapar-lavaplatos_short_v2.mp4')
  assert.equal(nombreFinal({ cliente: '', tema: '', formato: 'otro', n: 0, ext: 'SRT' }), 'Interno_video_youtube_v1.srt')
  assert.equal(formatoPorTamano(1080, 1920), 'short')
  assert.equal(formatoPorTamano(1920, 1080), 'youtube')
})

test('intermedios: mismo paso + entrada + parámetros = mismo nombre; distinto = otro', () => {
  const a = nombreIntermedio('sinsilencios', '/x/entrada.mp4', { umbral: -30 })
  assert.equal(a, nombreIntermedio('sinsilencios', '/x/entrada.mp4', { umbral: -30 }))
  assert.notEqual(a, nombreIntermedio('sinsilencios', '/x/entrada.mp4', { umbral: -35 }))
  assert.match(a, /^entrada\.sinsilencios\.[0-9a-f]{8}\.mp4$/)
  // encadenado: no se acumulan los pasos en el nombre
  assert.match(nombreIntermedio('audio', `/x/${a}`), /^entrada\.audio\.[0-9a-f]{8}\.mp4$/)
})

test('validación: el login de Google guardado como .mp4 no pasa; un video real sí', async () => {
  const dir = mkdtempSync(join(os.tmpdir(), 'video-'))
  assert.ok(pareceTexto(Buffer.from('<!DOCTYPE html><html><head><title>Google Drive</title>')))
  assert.ok(!pareceTexto(Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70])))
  const falso = join(dir, 'video.mp4')
  writeFileSync(falso, '<!DOCTYPE html><html><head><title>Iniciar sesión</title></head>' + 'x'.repeat(4000))
  const r1 = await validarVideo(falso, ffprobeStatic.path)
  assert.equal(r1.ok, false); assert.match(r1.motivo, /página web/)
  const real = join(dir, 'real.mp4')
  spawnSync(ffmpegPath, ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x568:d=1', '-pix_fmt', 'yuv420p', real])
  const r2 = await validarVideo(real, ffprobeStatic.path)
  assert.equal(r2.ok, true); assert.equal(formatoPorTamano(r2.ancho, r2.alto), 'short')
  assert.equal((await validarVideo(join(dir, 'no-existe.mp4'), ffprobeStatic.path)).ok, false)
})
