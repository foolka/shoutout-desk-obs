param(
    [Parameter(Mandatory=$true)][string]$Compiler,
    [Parameter(Mandatory=$true)][string]$ObsRoot,
    [string]$PreviousPackage,
    [switch]$ExpectBlocked
)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$version=(Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$package=Join-Path $root "release\shoutout-desk-obs-$version-windows-x64"
$testRoot=Join-Path $root ('.test-data\installer-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
& $Compiler '/Qp' "/DAppVersion=$version" "/DPackageDir=$package" "/DOutputDir=$testRoot" "/DTestRoot=$testRoot" (Join-Path $PSScriptRoot 'installer.iss')
if($LASTEXITCODE -ne 0){throw 'Test installer compilation failed'}
$exe=Join-Path $testRoot "shoutout-desk-obs-$version-installer-test.exe"
$target=Join-Path $testRoot 'plugin'
function Run-Setup([string]$name,[string[]]$extra=@()){
    $log=Join-Path $testRoot ($name+'.log')
    $args=@('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/LANG=en',"/OBSROOT=`"$ObsRoot`"","/LOG=`"$log`"")+$extra
    $p=Start-Process -FilePath $exe -ArgumentList $args -WindowStyle Hidden -PassThru -Wait
    return $p.ExitCode
}
if($ExpectBlocked){
    if((Run-Setup 'obs-open') -ne 7){throw 'Expected install to stop because OBS is running (exit 7)'}
    if(Test-Path -LiteralPath $target){throw 'Blocked installer created plugin files'}
    if(-not (Select-String -LiteralPath (Join-Path $testRoot 'obs-open.log') -SimpleMatch 'Close OBS Studio completely')){throw 'Wrong blocking reason'}
    Write-Output "PASS: running OBS blocks installation without writing plugin files. $testRoot"
    exit 0
}
if(Get-Process -Name obs64 -ErrorAction SilentlyContinue){throw 'Close OBS before lifecycle smoke test'}
$profile=Join-Path $testRoot 'personal-data-sentinel'
New-Item -ItemType Directory -Path $profile | Out-Null
[IO.File]::WriteAllText((Join-Path $profile 'shoutouts.sqlite'),'isolated-list-and-history-sentinel')
[IO.File]::WriteAllText((Join-Path $profile 'twitch-auth.dpapi'),'isolated-auth-sentinel')
$sentinels=Get-ChildItem -LiteralPath $profile | Get-FileHash -Algorithm SHA256
if((Run-Setup 'invalid-target' @("/DIR=`"$(Join-Path $testRoot 'wrong')`"")) -ne 7){throw 'Unexpected /DIR override accepted'}
if(Test-Path -LiteralPath (Join-Path $testRoot 'wrong')){throw 'Invalid target was written'}
if((Run-Setup 'fresh') -ne 0){throw 'Fresh installation failed'}
$manifest=Get-Content -LiteralPath (Join-Path $package 'manifest.json') -Raw | ConvertFrom-Json
function Assert-Payload {
    foreach($item in $manifest.files){
        $relative=$item.path.Substring('shoutout-desk-obs/'.Length)
        if((Get-FileHash -LiteralPath (Join-Path $target $relative) -Algorithm SHA256).Hash -ne $item.sha256){throw "Installed hash mismatch: $relative"}
    }
}
Assert-Payload
# Same-version repair exercises replacement without relying on versioned DLL resources.
[IO.File]::WriteAllText((Join-Path $target 'data\worker.cjs'),'test-only-damaged-worker')
if((Run-Setup 'repair') -ne 0){throw 'In-place repair failed'}
Assert-Payload
function Uninstall-Test([string]$name){
    $uninstaller=Join-Path $target 'uninstall\unins000.exe'
    $p=Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',"/LOG=`"$(Join-Path $testRoot ($name+'.log'))`"") -WindowStyle Hidden -PassThru -Wait
    if($p.ExitCode -ne 0){throw 'Uninstall failed'}
}
Uninstall-Test 'uninstall'
foreach($item in $manifest.files){
    if(Test-Path -LiteralPath (Join-Path $target $item.path.Substring('shoutout-desk-obs/'.Length))){throw "Payload remains after uninstall: $($item.path)"}
}
if($PreviousPackage){
    $old=Join-Path ([IO.Path]::GetFullPath($PreviousPackage)) 'shoutout-desk-obs'
    if(-not (Test-Path -LiteralPath (Join-Path $old 'bin\64bit\shoutout-desk-obs.dll'))){throw 'Previous ZIP payload not found'}
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $old 'bin'),(Join-Path $old 'data') -Destination $target -Recurse -Force
    $extra=Join-Path $target 'user-note.txt'
    [IO.File]::WriteAllText($extra,'preserve-untracked-file')
    if((Run-Setup 'legacy-zip-upgrade') -ne 0){throw 'Upgrade from previous ZIP failed'}
    Assert-Payload
    Uninstall-Test 'legacy-upgrade-uninstall'
    if([IO.File]::ReadAllText($extra) -ne 'preserve-untracked-file'){throw 'Uninstall deleted an untracked file'}
    Write-Output 'PASS: previous ZIP upgrade and untracked file preservation.'
}
foreach($file in $sentinels){
    if((Get-FileHash -LiteralPath $file.Path -Algorithm SHA256).Hash -ne $file.Hash){throw 'Personal data sentinel changed'}
}
Write-Output "PASS: fresh install, invalid destination, in-place repair, uninstall and separate data retention. $testRoot"
