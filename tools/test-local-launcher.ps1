param()
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$launcher = Join-Path $root 'scripts\Open-LocalSite.ps1'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$work = Join-Path $root '.runtime\local-launcher-tests'
$output = Join-Path $root 'artifacts\local-launcher'
New-Item -ItemType Directory -Path $work, $output -Force | Out-Null
$results = @()
$testServerId = $null
$foreign = $null
$launcherIds = @()
$defaultIds = @(Get-NetTCPConnection -LocalPort 5186 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)

function Assert-True($condition, [string]$message) {
    if (-not $condition) { throw $message }
    Write-Output "PASS $message"
}
function Free-Port {
    $probe = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
    $probe.Start()
    $port = $probe.LocalEndpoint.Port
    $probe.Stop()
    return $port
}
function Run-Launcher([int]$port, [string]$name) {
    $process = Start-Process -FilePath $powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $launcher), '-CheckOnly', '-SkipSpeech', '-Port', $port) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $work "$name.log") -RedirectStandardError (Join-Path $work "$name-error.log") -PassThru
    $null = $process.Handle
    $script:launcherIds += $process.Id
    return $process
}
function Wait-Launcher($process) {
    if (-not $process.WaitForExit(55000)) { throw 'Launcher test timed out.' }
    return $process.ExitCode
}
function Listener-Ids([int]$port) {
    return @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
}

try {
    $port = Free-Port
    $first = Run-Launcher $port 'cold-first'
    $second = Run-Launcher $port 'cold-second'
    Assert-True ((Wait-Launcher $first) -eq 0) 'cold startup succeeds'
    Assert-True ((Wait-Launcher $second) -eq 0) 'concurrent startup succeeds without duplicate errors'
    $ids = @(Listener-Ids $port)
    Assert-True ($ids.Count -eq 1) 'one server owns the isolated port'
    $testServerId = $ids[0]
    $owner = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $testServerId)
    Assert-True ($owner.CommandLine.Contains((Join-Path $root 'node_modules\vite\bin\vite.js'))) 'server is the original project Vite'
    $response = Invoke-WebRequest -Uri "http://localhost:$port/" -UseBasicParsing -TimeoutSec 5
    Assert-True ($response.StatusCode -eq 200 -and $response.Content -match 'CodeWords') 'current website responds after cold startup'
    $audio = Invoke-WebRequest -Uri "http://localhost:$port/audio/aria/word-1.mp3" -UseBasicParsing -TimeoutSec 5
    Assert-True ($audio.StatusCode -eq 200 -and $audio.RawContentLength -gt 0) 'local audio is accessible'
    $repeat = Run-Launcher $port 'repeat'
    Assert-True ((Wait-Launcher $repeat) -eq 0) 'repeat startup succeeds'
    Assert-True ((@(Listener-Ids $port) -join ',') -eq "$testServerId") 'repeat startup reuses the same process'
    $results += @{ name = 'cold concurrent startup and repeat reuse'; passed = $true; port = $port; pid = $testServerId }

    $foreignPort = Free-Port
    $fixture = Join-Path $work 'foreign-server.cjs'
    [IO.File]::WriteAllText($fixture, "require('node:http').createServer((req,res)=>res.end('<title>CodeWords</title><script src=`"src/main.tsx`"></script>')).listen(Number(process.argv[2]),'127.0.0.1');")
    $foreign = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @(('"{0}"' -f $fixture), $foreignPort) -WorkingDirectory $work -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddSeconds(10)
    while (-not (Listener-Ids $foreignPort)) {
        if ($foreign.HasExited -or (Get-Date) -gt $deadline) { throw 'Foreign-server fixture did not start.' }
        Start-Sleep -Milliseconds 100
    }
    $blocked = Run-Launcher $foreignPort 'occupied'
    Assert-True ((Wait-Launcher $blocked) -ne 0) 'a lookalike website from another process is rejected'
    $message = Get-Content -LiteralPath (Join-Path $env:LOCALAPPDATA "CodeWords-Local\test-$foreignPort\startup-error.log") -Raw -Encoding UTF8
    Assert-True ($message -match '本地端口' -and $message -match '占用') 'port conflict has a readable Chinese diagnostic'
    Assert-True ((@(Listener-Ids $foreignPort) -join ',') -eq "$($foreign.Id)") 'conflicting process is preserved'
    Assert-True ((@(Listener-Ids 5186) -join ',') -eq ($defaultIds -join ',')) 'existing default-port website is preserved'
    $results += @{ name = 'identity and port conflict protection'; passed = $true; port = $foreignPort }
    $results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $output 'startup-results.json') -Encoding UTF8
} finally {
    # Stop only processes created by this isolated test, after checking identity.
    if (-not $testServerId -and $port) {
        foreach ($id in @(Listener-Ids $port)) {
            $owner = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $id) -ErrorAction SilentlyContinue
            if ($owner -and $owner.ParentProcessId -in $launcherIds -and $owner.CommandLine.Contains((Join-Path $root 'node_modules\vite\bin\vite.js'))) { $testServerId = $id }
        }
    }
    if ($testServerId) {
        $owner = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $testServerId) -ErrorAction SilentlyContinue
        if ($owner -and $owner.CommandLine.Contains((Join-Path $root 'node_modules\vite\bin\vite.js')) -and $owner.CommandLine -match ("--port\s+{0}\b" -f $port)) {
            Stop-Process -Id $testServerId -ErrorAction SilentlyContinue
        }
    }
    if ($foreign) {
        $owner = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $foreign.Id) -ErrorAction SilentlyContinue
        if ($owner -and $owner.CommandLine.Contains($fixture)) { Stop-Process -Id $foreign.Id -ErrorAction SilentlyContinue }
    }
}
