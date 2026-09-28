param([Parameter(Mandatory=$true)][string]$ReferenceObs)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$version=(Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$package=Join-Path $root "release\shoutout-desk-obs-$version-windows-x64"
$target=Join-Path $root ('.test-data\portable-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $target 'bin\64bit'),(Join-Path $target 'config\shoutout-desk-obs') -Force | Out-Null
foreach($file in @('obs64.exe','Qt6Core.dll')){Copy-Item -LiteralPath (Join-Path $ReferenceObs ('bin\64bit\'+$file)) -Destination (Join-Path $target 'bin\64bit')}
[IO.File]::WriteAllText((Join-Path $target 'portable_mode.txt'),'')
$profile=Join-Path $target 'config\shoutout-desk-obs\history-sentinel.txt'
[IO.File]::WriteAllText($profile,'test-only-profile')
$hash=(Get-FileHash -LiteralPath $profile).Hash
for($i=0;$i -lt 2;$i++){
    & (Join-Path $package 'Install-Portable.ps1') -ObsRoot $target
    if((Get-FileHash -LiteralPath (Join-Path $target 'obs-plugins\64bit\shoutout-desk-obs.dll')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $package 'shoutout-desk-obs\bin\64bit\shoutout-desk-obs.dll')).Hash){throw 'Wrong DLL'}
    if((Get-FileHash -LiteralPath $profile).Hash -ne $hash){throw 'Portable profile changed'}
}
Write-Output "PASS: portable install and update preserve config. OBS was not launched. $target"
