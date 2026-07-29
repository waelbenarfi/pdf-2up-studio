@echo off
title 2-up Studio
cd /d "%~dp0"
echo Demarrage de 2-up Studio sur http://localhost:1200 ...
start "" http://localhost:1200
python app.py
pause
