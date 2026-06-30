$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Version = '0.3.2'
$Python = Join-Path $Root '.venv\Scripts\python.exe'
if (-not (Test-Path $Python)) { throw 'Run Install-OpenMarquee.ps1 before building a release.' }

function Invoke-Python {
    & $Python @args
    if ($LASTEXITCODE -ne 0) { throw "Python command failed with exit code $LASTEXITCODE" }
}

Invoke-Python -m pip install pyinstaller==6.20.0 pillow==11.3.0 --disable-pip-version-check
Invoke-Python packaging\make_icon.py
Remove-Item -Recurse -Force build,dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force release -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force release | Out-Null

Invoke-Python -m PyInstaller --noconfirm --clean --onedir --noconsole `
    --name OpenMarquee `
    --icon packaging\OpenMarquee.ico `
    --version-file packaging\version_info.txt `
    --add-data 'static;static' `
    main.py

$Portable = Join-Path $Root "release\OpenMarquee-v$Version-portable.zip"
Compress-Archive -Path 'dist\OpenMarquee\*' -DestinationPath $Portable -CompressionLevel Optimal -Force

$Setup = Join-Path $Root "release\OpenMarquee-Setup-v$Version.exe"
$InnoCompiler = Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'
if (-not (Test-Path $InnoCompiler)) { throw 'Inno Setup 6 is required to build the installer.' }
& $InnoCompiler 'packaging\OpenMarquee.iss'
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Setup)) { throw 'Windows setup executable creation failed.' }
$description = (Get-Item $Setup).VersionInfo.FileDescription.Trim()
if ($description -ne 'OpenMarquee digital signage installer') { throw 'Unexpected or obsolete installer format was produced.' }

$Defender = Join-Path $env:ProgramFiles 'Windows Defender\MpCmdRun.exe'
if (Test-Path $Defender) {
    foreach ($Artifact in @($Setup, $Portable)) {
        & $Defender -Scan -ScanType 3 -File $Artifact
        if ($LASTEXITCODE -ne 0) { throw "Microsoft Defender rejected $Artifact" }
    }
}

$Checksums = @($Setup, $Portable) | ForEach-Object {
    $Hash = Get-FileHash -LiteralPath $_ -Algorithm SHA256
    "$($Hash.Hash.ToLowerInvariant())  $(Split-Path -Leaf $_)"
}
Set-Content -LiteralPath (Join-Path $Root 'release\SHA256SUMS.txt') -Value $Checksums -Encoding ASCII
Write-Host "Release artifacts created in $Root\release" -ForegroundColor Green
