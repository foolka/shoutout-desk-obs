param([string]$ObsRoot, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $ObsRoot) {
    Add-Type -AssemblyName System.Windows.Forms
    $pick = New-Object System.Windows.Forms.OpenFileDialog
    $pick.Title = 'Select portable OBS: bin/64bit/obs64.exe'
    $pick.Filter = 'OBS Studio|obs64.exe'
    if ($pick.ShowDialog() -ne 'OK') { exit 0 }
    $ObsRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $pick.FileName))
}
$root = [IO.Path]::GetFullPath($ObsRoot).TrimEnd('\')
$exe = Join-Path $root 'bin\64bit\obs64.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'Select the root of an OBS Windows x64 ZIP distribution.' }
if (-not ((Test-Path -LiteralPath (Join-Path $root 'portable_mode.txt')) -or (Test-Path -LiteralPath (Join-Path $root 'portable_mode')))) { throw 'Enable OBS portable mode first: create an empty portable_mode.txt in the OBS root.' }
$version = (Get-Item -LiteralPath $exe).VersionInfo.FileMajorPart
$qt = Get-Item -LiteralPath (Join-Path $root 'bin\64bit\Qt6Core.dll')
if ($version -lt 32 -or $qt.VersionInfo.FileMajorPart -ne 6 -or $qt.VersionInfo.FileMinorPart -lt 8) { throw 'OBS 32+ and Qt 6.8+ are required.' }
$source = Join-Path $PSScriptRoot 'shoutout-desk-obs'
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.platform -ne 'windows-x64') { throw 'Wrong package platform.' }
$allowed = [IO.Path]::GetFullPath($source) + '\'
foreach ($item in $manifest.files) {
    $file = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $item.path))
    if (-not $file.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid package path.' }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $item.sha256) { throw 'Package checksum mismatch.' }
}
if ($CheckOnly) { Write-Output 'Portable target and payload verified. No changes.'; exit 0 }
if (Get-Process obs64 -ErrorAction SilentlyContinue) { throw 'Close all OBS instances first. No changes.' }
$dll = Join-Path $root 'obs-plugins\64bit\shoutout-desk-obs.dll'
$data = Join-Path $root 'data\obs-plugins\shoutout-desk-obs'
foreach ($target in @($dll, $data)) {
    if (-not ([IO.Path]::GetFullPath($target)).StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe target.' }
}
$backup = Join-Path $root ('shoutout-install-backups\' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$hadDll = Test-Path -LiteralPath $dll
$hadData = Test-Path -LiteralPath $data
$movedDll = $false
$movedData = $false
try {
    if ($hadDll) { Move-Item -LiteralPath $dll -Destination (Join-Path $backup 'shoutout-desk-obs.dll'); $movedDll = $true }
    if ($hadData) { Move-Item -LiteralPath $data -Destination (Join-Path $backup 'data'); $movedData = $true }
    New-Item -ItemType Directory -Path (Split-Path -Parent $dll),(Split-Path -Parent $data) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $source 'bin\64bit\shoutout-desk-obs.dll') -Destination $dll
    Copy-Item -LiteralPath (Join-Path $source 'data') -Destination $data -Recurse
    Write-Output ('Portable plugin installed. Profile: ' + (Join-Path $root 'config\shoutout-desk-obs'))
} catch {
    # These exact targets were checked inside the selected portable OBS root above.
    if (($movedDll -or -not $hadDll) -and (Test-Path -LiteralPath $dll)) { Remove-Item -LiteralPath $dll -Force }
    if (($movedData -or -not $hadData) -and (Test-Path -LiteralPath $data)) { Remove-Item -LiteralPath $data -Recurse -Force }
    if ($movedDll) { Move-Item -LiteralPath (Join-Path $backup 'shoutout-desk-obs.dll') -Destination $dll }
    if ($movedData) { Move-Item -LiteralPath (Join-Path $backup 'data') -Destination $data }
    throw
}
