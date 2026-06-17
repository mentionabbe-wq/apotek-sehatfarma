@echo off
title Apotek - Docker
echo ====================================
echo   SehatFarma - Docker Container
echo ====================================
echo.
echo Membangun dan menjalankan container...
echo.

docker compose up --build -d

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Gagal menjalankan Docker.
    echo Pastikan Docker Desktop sudah berjalan.
    pause
    exit /b 1
)

echo.
echo ====================================
echo   Aplikasi berjalan di:
echo   http://localhost:8080
echo ====================================
echo.

start "" "http://localhost:8080"

echo Untuk menghentikan: jalankan "HENTIKAN DOCKER.bat"
echo.
pause
