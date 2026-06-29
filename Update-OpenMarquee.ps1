$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$git = (Get-Command git -ErrorAction SilentlyContinue)?.Source
if (-not $git -and (Test-Path 'C:\Program Files\Git\cmd\git.exe')) {
    $git = 'C:\Program Files\Git\cmd\git.exe'
}
if (-not $git) {
    throw 'Git is required to update OpenMarquee.'
}

& $git pull --ff-only
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt --disable-pip-version-check
Write-Host 'OpenMarquee is up to date.' -ForegroundColor Green
