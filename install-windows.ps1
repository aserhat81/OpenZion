# Local Agent - Windows Installer
# Right-click this file -> "Run with PowerShell"

$ErrorActionPreference = "Stop"

# Find the .vsix file in the same folder as this script
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VSIX = Get-ChildItem -Path $ScriptDir -Filter "*.vsix" | Select-Object -First 1

function Write-Header {
    Clear-Host
    Write-Host ""
    Write-Host "  +======================================+" -ForegroundColor Green
    Write-Host "  |       LOCAL AGENT - INSTALLER        |" -ForegroundColor Green
    Write-Host "  |   AI Software Engineer for VS Code   |" -ForegroundColor Green
    Write-Host "  +======================================+" -ForegroundColor Green
    Write-Host ""
}

Write-Header

# ── Step 1: Check VS Code ──────────────────────────────────────────────────
Write-Host "  [1/2] Checking VS Code..." -ForegroundColor Cyan

$code = Get-Command code -ErrorAction SilentlyContinue
if (-not $code) {
    Write-Host ""
    Write-Host "  ERROR: VS Code not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Please install VS Code first:" -ForegroundColor Yellow
    Write-Host "  -> https://code.visualstudio.com/download" -ForegroundColor White
    Write-Host ""
    $open = Read-Host "  Open download page now? (Y/n)"
    if ($open -ne 'n' -and $open -ne 'N') {
        Start-Process "https://code.visualstudio.com/download"
        Write-Host ""
        Write-Host "  After installing VS Code, run this file again." -ForegroundColor Yellow
    }
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}

$ver = & code --version 2>$null | Select-Object -First 1
Write-Host "  OK - VS Code v$ver found" -ForegroundColor Green

# ── Step 2: Install Extension ──────────────────────────────────────────────
Write-Host ""
Write-Host "  [2/2] Installing extension..." -ForegroundColor Cyan

if (-not $VSIX) {
    Write-Host "  ERROR: No .vsix file found in this folder!" -ForegroundColor Red
    Write-Host "  Make sure install-windows.ps1 and the .vsix file are in the same folder." -ForegroundColor Yellow
    Read-Host "  Press Enter to exit"
    exit 1
}

Write-Host "  File: $($VSIX.Name)" -ForegroundColor DarkGray

try {
    $out = & code --install-extension $VSIX.FullName --force 2>&1
    Write-Host "  OK - Extension installed/updated!" -ForegroundColor Green
}
catch {
    Write-Host "  ERROR: Installation failed - $_" -ForegroundColor Red
    Read-Host "  Press Enter to exit"
    exit 1
}

# ── Done ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  +======================================+" -ForegroundColor Green
Write-Host "  |        INSTALLATION COMPLETE!        |" -ForegroundColor Green
Write-Host "  +======================================+" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "  1. Reload VS Code: Ctrl+Shift+P -> Reload Window" -ForegroundColor White
Write-Host "  2. Start Ollama:   ollama serve" -ForegroundColor White
Write-Host "  3. Open Local Agent from the left sidebar" -ForegroundColor White
Write-Host ""

Read-Host "  Press Enter to exit"
