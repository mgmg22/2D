@echo off
cd /d "%~dp0"

echo Starting Python HTTP server on port 8765 ...
start http://localhost:8765

python -m http.server 8765

pause