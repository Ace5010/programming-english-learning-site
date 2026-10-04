param(
    [switch]$CheckOnly,
    [ValidateRange(1024, 65535)][int]$Port = 5186,
    [switch]$SkipSpeech
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$siteUrl = "http://localhost:$Port/"
$probeUrl = "http://127.0.0.1:$Port/"
$logDirectory = Join-Path $env:LOCALAPPDATA 'CodeWords-Local'
if ($Port -ne 5186) { $logDirectory = Join-Path $logDirectory "test-$Port" }
$vite = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
$speechUrl = 'http://127.0.0.1:18768/health'
$startupMutex = $null
$ownsMutex = $false

function Test-QwenReady {
    try {
        $health = Invoke-RestMethod -Uri $speechUrl -TimeoutSec 2
        if ($health.ready -ne $true -or $health.engine -ne 'qwen3-asr-trial-v1') { return $false }
        $session = Invoke-RestMethod -Uri 'http://127.0.0.1:18768/api/course-session' -Headers @{ Origin = 'http://localhost:5186' } -TimeoutSec 2
        return ($session.ready -eq $true -and $session.engine -eq 'qwen3-asr-trial-v1')
    } catch { return $false }
}

function Start-LocalQwen {
    if (Test-QwenReady) { return }
    $python = Join-Path $projectRoot '.runtime\pronunciation\mdd-venv\Scripts\python.exe'
    $serverScript = Join-Path $projectRoot 'tools\serve_pronunciation_lab.py'
    if (-not (Test-Path -LiteralPath $python)) { return }
    $listener = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 18768 -State Listen -ErrorAction SilentlyContinue
    if ($listener) { return }
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $speech = Start-Process -FilePath $python -ArgumentList @(('"{0}"' -f $serverScript), '--engine', 'qwen', '--port', '18768') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'speech.log') -RedirectStandardError (Join-Path $logDirectory 'speech-error.log') -PassThru
    $deadline = (Get-Date).AddSeconds(60)
    while (-not (Test-QwenReady) -and -not $speech.HasExited -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 400
    }
}

function Test-SiteOwner($listener) {
    $owner = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $listener.OwningProcess)
    return ($owner.CommandLine -and $owner.CommandLine.IndexOf($vite, [StringComparison]::OrdinalIgnoreCase) -ge 0)
}

function Test-SiteReady {
    try {
        $response = Invoke-WebRequest -Uri $probeUrl -UseBasicParsing -TimeoutSec 4
        if ($response.StatusCode -ne 200 -or $response.Content -notmatch '<title>[^<]*CodeWords</title>' -or $response.Content -notmatch 'src/main.tsx') { return $false }
        foreach ($listener in @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
            if (Test-SiteOwner $listener) { return $true }
        }
        return $false
    } catch { return $false }
}

try {
    $startupMutex = New-Object System.Threading.Mutex($false, "Local\CodeWords-Site-$Port")
    try { $ownsMutex = $startupMutex.WaitOne(45000) }
    catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { throw '上一次启动仍在进行，请稍后再试。' }
    if (-not (Test-SiteReady)) {
        $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
        if (@($listeners | Where-Object { -not (Test-SiteOwner $_) }).Count) {
            throw "本地端口 $Port 已被其他程序占用。请先确认占用程序，启动器不会停止它或改用其他端口。"
        }
        $server = $null
        if (-not $listeners.Count) {
            if (-not (Test-Path -LiteralPath $vite)) {
                throw '缺少网站运行依赖。请在项目目录执行 npm install 后再启动。'
            }
            $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
            if (-not $node) { throw '没有找到 Node.js。请安装 Node.js 后重新启动。' }
            New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
            $server = Start-Process -FilePath $node -ArgumentList @(('"{0}"' -f $vite), '--host', 'localhost', '--port', $Port, '--strictPort') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'server.log') -RedirectStandardError (Join-Path $logDirectory 'server-error.log') -PassThru
        }
        $deadline = (Get-Date).AddSeconds(30)
        while (-not (Test-SiteReady)) {
            if ($server -and $server.HasExited) { throw "网站服务启动失败。诊断日志：$logDirectory\server-error.log" }
            if ((Get-Date) -gt $deadline) { throw "网站服务等待超时。诊断日志：$logDirectory" }
            Start-Sleep -Milliseconds 300
        }
    }
    if (-not $CheckOnly) {
        $chromePaths = @(
            (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
            (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
            (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
        )
        $chrome = $chromePaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if ($chrome) { Start-Process -FilePath $chrome -ArgumentList $siteUrl -WindowStyle Normal }
        else { Start-Process $siteUrl }
    }
    # Open the website promptly; optional local recognition can become ready later.
    if (-not $SkipSpeech -and $Port -eq 5186) {
        try { Start-LocalQwen }
        catch {
            New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
            Add-Content -LiteralPath (Join-Path $logDirectory 'speech-error.log') -Value $_.Exception.Message -Encoding UTF8
        }
    }
    if ($CheckOnly) { Write-Output $siteUrl }
} catch {
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    Add-Content -LiteralPath (Join-Path $logDirectory 'startup-error.log') -Value $_.Exception.Message -Encoding UTF8
    if ($CheckOnly) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '英语学习启动失败') | Out-Null
    exit 1
} finally {
    if ($ownsMutex) { $startupMutex.ReleaseMutex() }
    if ($startupMutex) { $startupMutex.Dispose() }
}
