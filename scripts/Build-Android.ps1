param(
    [ValidateSet('Debug','Release')][string]$Variant = 'Release',
    [string]$SdkPath = $env:ANDROID_HOME,
    [string]$JavaPath = $env:JAVA_HOME,
    [Parameter(Mandatory=$true)][string]$GradlePath,
    [string]$GradleCache,
    [switch]$InitializeSigning,
    [switch]$SkipWebBuild,
    [switch]$Validate
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskAndroid = Join-Path $taskRoot 'android'
$taskRuntime = Join-Path $taskRoot '.runtime\android'
if (-not $JavaPath -or -not (Test-Path -LiteralPath (Join-Path $JavaPath 'bin\java.exe'))) { throw '请提供 JDK 17+ 的 -JavaPath 或 JAVA_HOME。' }
if (-not $SdkPath -or -not (Test-Path -LiteralPath (Join-Path $SdkPath 'platforms\android-35\android.jar'))) { throw '请提供 Android SDK 35 的 -SdkPath 或 ANDROID_HOME。' }
if (-not (Test-Path -LiteralPath $GradlePath)) { throw '请提供 Gradle 8.11.1 的 gradle.bat 路径。' }
New-Item -ItemType Directory -Path $taskRuntime -Force | Out-Null
$taskVariables = @{
    JAVA_HOME = (Resolve-Path -LiteralPath $JavaPath).Path
    ANDROID_HOME = (Resolve-Path -LiteralPath $SdkPath).Path
    GRADLE_USER_HOME = $(if ($GradleCache) { $GradleCache } else { Join-Path $taskRuntime 'gradle-cache' })
}
$taskPrevious = @{}
foreach ($taskName in @($taskVariables.Keys) + @('JAVA_TOOL_OPTIONS', 'CODEWORDS_SIGNING_PASSWORD')) {
    $taskPrevious[$taskName] = [Environment]::GetEnvironmentVariable($taskName, 'Process')
}
foreach ($taskName in $taskVariables.Keys) { [Environment]::SetEnvironmentVariable($taskName, $taskVariables[$taskName], 'Process') }
Push-Location -LiteralPath $taskRoot
try {
    if (-not $SkipWebBuild) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw '网页构建或音频校验失败，停止打包。' }
    }
    $taskSigningFile = Join-Path $taskAndroid 'keystore.properties'
    if ($InitializeSigning -and -not (Test-Path -LiteralPath $taskSigningFile)) {
        $taskKey = Join-Path $taskRuntime 'codewords-release.jks'
        if (Test-Path -LiteralPath $taskKey) { throw '已有签名密钥但配置缺失；请恢复原配置，不要覆盖密钥。' }
        $taskBytes = New-Object byte[] 32
        $taskRandom = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try { $taskRandom.GetBytes($taskBytes) } finally { $taskRandom.Dispose() }
        $env:CODEWORDS_SIGNING_PASSWORD = [Convert]::ToBase64String($taskBytes)
        & (Join-Path $JavaPath 'bin\keytool.exe') -genkeypair -keystore $taskKey -storetype JKS -alias codewords -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=CodeWords Local Release' -storepass:env CODEWORDS_SIGNING_PASSWORD -keypass:env CODEWORDS_SIGNING_PASSWORD
        if ($LASTEXITCODE -ne 0) { throw '签名密钥创建失败。' }
        $taskSigning = "storeFile=../.runtime/android/codewords-release.jks`nstorePassword=$env:CODEWORDS_SIGNING_PASSWORD`nkeyAlias=codewords`nkeyPassword=$env:CODEWORDS_SIGNING_PASSWORD`n"
        [System.IO.File]::WriteAllText($taskSigningFile, $taskSigning, [System.Text.Encoding]::ASCII)
    }
    # This nonexistent per-build directory lets JDK use its Windows TCP pipe fallback.
    $taskNoSocket = Join-Path $taskRuntime ('no-unix-sockets-' + [guid]::NewGuid().ToString('N'))
    $env:JAVA_TOOL_OPTIONS = (($taskPrevious.JAVA_TOOL_OPTIONS, ('-Djdk.net.unixdomain.tmpdir="' + $taskNoSocket + '"')) -join ' ').Trim()
    Set-Location -LiteralPath $taskAndroid
    $taskTargets = @('assemble' + $Variant)
    if ($Validate) { $taskTargets += @('assembleDebug', 'lintRelease') }
    & $GradlePath @taskTargets --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) { throw '安卓构建或检查失败。' }
    $taskVariantName = $Variant.ToLowerInvariant()
    $taskApk = Join-Path $taskAndroid "app\build\outputs\apk\$taskVariantName\app-$taskVariantName.apk"
    if (-not (Test-Path -LiteralPath $taskApk)) { throw '未生成已签名 APK，请检查签名配置。' }
    $taskOutput = Join-Path $taskRoot 'artifacts\android'
    New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
    $taskPublished = Join-Path $taskOutput "codewords-1.1.0-$taskVariantName.apk"
    Copy-Item -LiteralPath $taskApk -Destination $taskPublished -Force
    $taskHash = Get-FileHash -LiteralPath $taskPublished -Algorithm SHA256
    [System.IO.File]::WriteAllText(($taskPublished + '.sha256'), ($taskHash.Hash.ToLowerInvariant() + '  ' + [System.IO.Path]::GetFileName($taskPublished) + "`n"))
    $taskHash | Select-Object Path,Hash
} finally {
    Pop-Location
    foreach ($taskName in $taskPrevious.Keys) { [Environment]::SetEnvironmentVariable($taskName, $taskPrevious[$taskName], 'Process') }
}
