param([string]$PluginRoot = (Join-Path $env:ProgramData 'obs-studio\plugins'), [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$source = Join-Path $PSScriptRoot 'shoutout-desk-obs'
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.platform -ne 'windows-x64') { throw 'Unsupported package.' }
foreach ($item in $manifest.files) {
    $absolute = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $item.path))
    $allowed = [IO.Path]::GetFullPath($source) + [IO.Path]::DirectorySeparatorChar
    if (-not $absolute.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid package path.' }
    if ((Get-FileHash -LiteralPath $absolute -Algorithm SHA256).Hash -ne $item.sha256) { throw "Package checksum mismatch: $($item.path)" }
}
if ($CheckOnly) { Write-Output 'Package checksums verified. No installation performed.'; exit 0 }
if (Get-Process obs64 -ErrorAction SilentlyContinue) { throw 'Close OBS Studio before installing or updating. No files were changed.' }
$base = [IO.Path]::GetFullPath($PluginRoot)
$target = [IO.Path]::GetFullPath((Join-Path $base 'shoutout-desk-obs'))
if ([IO.Path]::GetDirectoryName($target) -ne $base.TrimEnd('\')) { throw 'Unsafe installation directory.' }
New-Item -ItemType Directory -Path $base -Force | Out-Null
$stage = Join-Path $base ('shoutout-desk-obs-install-' + [Guid]::NewGuid().ToString('N'))
$backup = $null
try {
    New-Item -ItemType Directory -Path $stage | Out-Null
    Copy-Item -LiteralPath (Join-Path $source 'bin'),(Join-Path $source 'data') -Destination $stage -Recurse
    if (Get-Process obs64 -ErrorAction SilentlyContinue) { throw 'OBS was opened during installation. Close it and try again.' }
    if (Test-Path -LiteralPath $target) {
        $backupBase = Join-Path $env:ProgramData 'ShoutoutDeskOBS-install-backups'
        New-Item -ItemType Directory -Path $backupBase -Force | Out-Null
        $backup = Join-Path $backupBase ('before-' + $manifest.version + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
        if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($backup)) -ne [IO.Path]::GetFullPath($backupBase)) { throw 'Unsafe backup path.' }
        Move-Item -LiteralPath $target -Destination $backup
    }
    Move-Item -LiteralPath $stage -Destination $target
    Write-Output "Installed Shoutout Desk OBS $($manifest.version)."
    Write-Output 'Your lists, history and sign-in were not changed.'
    Write-Output 'Start OBS, then open Docks > Shoutout Desk.'
    if ($backup) { Write-Output "Previous plugin files: $backup" }
} catch {
    if ($backup -and (Test-Path -LiteralPath $backup) -and -not (Test-Path -LiteralPath $target)) { Move-Item -LiteralPath $backup -Destination $target }
    throw
} finally {
    $resolvedStage = [IO.Path]::GetFullPath($stage)
    if ((Test-Path -LiteralPath $stage) -and [IO.Path]::GetDirectoryName($resolvedStage) -eq $base.TrimEnd('\') -and [IO.Path]::GetFileName($resolvedStage).StartsWith('shoutout-desk-obs-install-')) {
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
}
