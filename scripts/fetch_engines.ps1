# Fetch everything that is downloaded rather than written: the lc0 binary and
# the nine Maia networks. Both live under engines\ and are gitignored, so this
# is what makes a fresh clone runnable.
#
#   powershell -File scripts\fetch_engines.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$LC0_VERSION = 'v0.32.1'
$RATINGS = 1100, 1500, 1900

New-Item -ItemType Directory -Force "$root\engines\maia" | Out-Null

if (Test-Path "$root\engines\lc0\lc0.exe") {
    Write-Host "lc0 already present, skipping."
} else {
    $zip = "$root\engines\lc0.zip"
    $url = "https://github.com/LeelaChessZero/lc0/releases/download/$LC0_VERSION/lc0-$LC0_VERSION-windows-cpu-dnnl.zip"
    Write-Host "Downloading lc0 $LC0_VERSION..."
    Invoke-WebRequest $url -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath "$root\engines\lc0" -Force
    Remove-Item $zip
    # The bundled default network is a full-strength Leela net; Maia replaces it.
    Remove-Item "$root\engines\lc0\*.pb.gz" -ErrorAction SilentlyContinue
}

foreach ($rating in $RATINGS) {
    $out = "$root\engines\maia\maia-$rating.pb.gz"
    if (Test-Path $out) { continue }
    Write-Host "Downloading maia-$rating..."
    Invoke-WebRequest "https://github.com/CSSLab/maia-chess/raw/master/maia_weights/maia-$rating.pb.gz" `
        -OutFile $out -UseBasicParsing
}

Write-Host "Done."
