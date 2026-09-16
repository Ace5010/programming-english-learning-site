param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$siteUrl = 'http://localhost:5186/'
$logDirectory = Join-Path $env:LOCALAPPDATA 'CodeWords-Local'

function Test-SiteReady {
    try {
        $response = Invoke-WebRequest -Uri $siteUrl -UseBasicParsing -TimeoutSec 2
        return ($response.StatusCode -eq 200 -and $response.Content -match '<title>[^<]*CodeWords</title>' -and $response.Content -match 'src/main.tsx')
    } catch { return $false }
}

try {
    if (-not (Test-SiteReady)) {
        $vite = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
        if (-not (Test-Path -LiteralPath $vite)) {
            throw 'Project dependencies are missing. Run npm install in the project folder first.'
        }
        $node = (Get-Command node.exe -ErrorAction Stop).Source
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
        $server = Start-Process -FilePath $node -ArgumentList @(('"{0}"' -f $vite), '--host', 'localhost', '--port', '5186', '--strictPort') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'server.log') -RedirectStandardError (Join-Path $logDirectory 'server-error.log') -PassThru
        $deadline = (Get-Date).AddSeconds(30)
        while (-not (Test-SiteReady)) {
            if ($server.HasExited) { throw "The local server could not start. Check $logDirectory\server-error.log (port 5186 may be occupied)." }
            if ((Get-Date) -gt $deadline) { throw "The local server did not become ready. Check $logDirectory." }
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
} catch {
    if ($CheckOnly) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'CodeWords - Local startup failed') | Out-Null
    exit 1
}
