$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not (Test-Path '.venv')) {
    python -m venv .venv
}
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt --disable-pip-version-check

$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'OpenMarquee.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$Root\Start-OpenMarquee.ps1`""
$shortcut.WorkingDirectory = $Root
$shortcut.Description = 'Open OpenMarquee digital signage'
$shortcut.Save()

Write-Host "OpenMarquee installed. Desktop shortcut: $shortcutPath" -ForegroundColor Green
& "$Root\Start-OpenMarquee.ps1"
