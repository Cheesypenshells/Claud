# Windows: install the Studio Bridge CEP panel into Premiere Pro (run once in PowerShell).
$src = Join-Path $PSScriptRoot "..\premiere-panel"
$dest = Join-Path $env:APPDATA "Adobe\CEP\extensions\com.studio.bridge"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
Copy-Item -Recurse $src $dest
foreach ($v in 9..13) { reg add "HKCU\Software\Adobe\CSXS.$v" /v PlayerDebugMode /t REG_SZ /d 1 /f | Out-Null }
Write-Host "Installed to $dest. Restart Premiere Pro, then Window > Extensions > Studio Bridge."
