@echo off
chcp 65001 >nul
set /p PROJECT=Project ID: 
call npm install --prefix functions
call npx firebase-tools login
call npx firebase-tools deploy --project %PROJECT%
pause
