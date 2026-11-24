@echo off
title Upload SehatFarma ke GitHub
cd /d "%~dp0"
echo ============================================
echo   Upload perubahan SehatFarma ke GitHub
echo ============================================
echo.
git add frontend/index.html
git commit -m "Tema biru dan menu samping berkelompok"
echo.
git push origin master
echo.
if errorlevel 1 (
  echo GAGAL upload. Foto layar ini dan kirim ke Claude.
) else (
  echo BERHASIL. Tunggu sekitar 5-10 menit sampai GitHub selesai
  echo menyiapkan versi baru, lalu update aplikasi di CasaOS.
)
echo.
pause
