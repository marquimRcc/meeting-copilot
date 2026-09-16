@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale Node.js 24 ou superior para executar a demonstracao.
  exit /b 1
)
node -e "if (Number(process.versions.node.split('.')[0]) < 24) { console.error('Use Node.js 24 ou superior.'); process.exit(1); }"
if errorlevel 1 exit /b 1
node demo/run.mjs %*
exit /b %errorlevel%
