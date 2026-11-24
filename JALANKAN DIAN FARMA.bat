@echo off
title Server Apotek Dian Farma
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang. Unduh versi LTS terbaru di https://nodejs.org lalu jalankan file ini lagi.
  pause
  exit /b
)
start "" http://localhost:3100/admin
node server\server.js
pause
