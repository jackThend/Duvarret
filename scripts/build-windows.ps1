param([switch]$SinInstalador, [switch]$ReutilizarReproductor, [ValidateRange(1, 16)][int]$Trabajos = 1)
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$nativeCache = Join-Path $repositoryRoot '.cache/native-build'
$compilerRoot = Join-Path $nativeCache 'msvc/VC/Tools/MSVC'
$compilerVersion = Get-ChildItem -LiteralPath $compilerRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1
if (-not $compilerVersion) { throw 'No se encuentran las herramientas MSVC portátiles.' }
$sdkRoot = 'C:/Program Files (x86)/Windows Kits/10'
$sdkVersion = '10.0.19041.0'
$env:CARGO_HOME = Join-Path $nativeCache 'cargo'
$env:RUSTUP_HOME = Join-Path $nativeCache 'rustup'
$env:VCToolsInstallDir = $compilerVersion.FullName + '\'
$env:VCToolsVersion = $compilerVersion.Name
$env:VCINSTALLDIR = Join-Path $nativeCache 'msvc/VC/'
$env:WindowsSdkDir = $sdkRoot + '/'
$env:WindowsSDKVersion = $sdkVersion + '\'
$env:VSCMD_ARG_HOST_ARCH = 'x64'
$env:VSCMD_ARG_TGT_ARCH = 'x64'
$compilerBin = Join-Path $compilerVersion.FullName 'bin/Hostx64/x64'
$env:PATH = "$env:CARGO_HOME/bin;$compilerBin;$sdkRoot/bin/$sdkVersion/x64;$env:PATH"
$env:INCLUDE = "$($compilerVersion.FullName)/include;$sdkRoot/Include/$sdkVersion/ucrt;$sdkRoot/Include/$sdkVersion/shared;$sdkRoot/Include/$sdkVersion/um;$sdkRoot/Include/$sdkVersion/winrt"
$env:LIB = "$($compilerVersion.FullName)/lib/x64;$sdkRoot/Lib/$sdkVersion/ucrt/x64;$sdkRoot/Lib/$sdkVersion/um/x64"
$env:CARGO_BUILD_JOBS = [string]$Trabajos
Set-Location -LiteralPath $repositoryRoot
& cargo --version
& rustc --version
$desktopArgs = @()
if ($SinInstalador) { $desktopArgs += '--no-bundle' }
if ($ReutilizarReproductor) { $desktopArgs += '--reuse-player' }
if ($desktopArgs.Count) { & npm run build:desktop -- @desktopArgs }
else { & npm run build:desktop }
if ($LASTEXITCODE -ne 0) { throw "La compilación nativa terminó con código $LASTEXITCODE." }
