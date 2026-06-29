$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not (Test-Path '.venv')) {
    python -m venv .venv
}

& .\.venv\Scripts\python.exe -m pip install -r requirements.txt --disable-pip-version-check --quiet

$listening = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
    Start-Process -FilePath "$Root\.venv\Scripts\python.exe" `
        -ArgumentList '-m','uvicorn','main:app','--host','0.0.0.0','--port','8787' `
        -WorkingDirectory $Root -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

Start-Process 'http://localhost:8787'
