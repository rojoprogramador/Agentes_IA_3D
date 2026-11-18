#!/usr/bin/env bash
# Motor de agentes - Agentes IA 3D (macOS / Linux). Ctrl + C para apagarlo.
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "Instalando dependencias por primera vez..."
  npm install --silent
fi
while true; do
  node worker.mjs
  if [ $? -eq 3 ]; then
    echo "Ya hay un motor encendido en este PC: este no arranca. (Si no hay ninguno, borra motor/logs/motor.lock)"
    exit 3
  fi
  echo
  echo "El motor se detuvo. Se reinicia en 15 segundos (Ctrl + C para apagarlo)..."
  sleep 15
done
