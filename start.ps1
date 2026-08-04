# Launch both halves of the app: the Maia engine server and the Vite dev
# server. Each gets its own window so their logs stay separate; closing a
# window stops that half.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

if (-not (Test-Path "$root\engines\lc0\lc0.exe")) {
    Write-Warning "lc0 is missing from engines\lc0 — Maia will not be available."
}
if (-not (Test-Path "$root\frontend\node_modules")) {
    Write-Host "Installing frontend dependencies..."
    npm --prefix "$root\frontend" install
}

Write-Host "Starting Maia server on http://127.0.0.1:8000"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root'; python server/app.py"

Write-Host "Starting the app on http://localhost:5173"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\frontend'; npm run dev"

Start-Sleep -Seconds 4
Start-Process 'http://localhost:5173'
