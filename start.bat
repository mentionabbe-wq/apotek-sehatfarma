@echo off
title ApotekPro - Server
color 0A
echo ====================================
echo   ApotekPro - Sistem Apotek
echo ====================================
echo.
echo Menginstal dependensi...
cd /d "%~dp0backend"
call npm install
echo.
echo Menjalankan server...
echo Buka browser ke: http://localhost:3000
echo.
echo Tekan CTRL+C untuk menghentikan server.
echo.
node server.js
pause
