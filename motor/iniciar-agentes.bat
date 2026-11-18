@echo off
title Motor de agentes - Agentes IA 3D
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm.cmd install --silent
)
:loop
node worker.mjs
if %errorlevel%==3 (
  echo Ya hay un motor encendido en este PC: este no arranca. Si no hay ninguno, borra motor\logs\motor.lock
  pause
  exit /b 3
)
echo.
echo El motor se detuvo. Se reinicia en 15 segundos (cierra esta ventana para apagarlo)...
timeout /t 15 /nobreak >nul
goto loop
