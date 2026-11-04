@echo off
chcp 65001 >nul
cd /d "%~dp0"
call npm install --prefix functions
call npx --yes firebase-tools login
call npx --yes firebase-tools deploy --only firestore,functions --project mishmish-5624b
pause
