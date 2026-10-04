param([string]$Ffmpeg = '', [string[]]$Ids = @())
$ErrorActionPreference = 'Stop'
$siteRoot = Split-Path -Parent $PSScriptRoot
if (-not $Ffmpeg) {
  $Ffmpeg = (& (Join-Path $siteRoot '.venv\Scripts\python.exe') -c 'import sys;sys.path.insert(0,"tools");from verify_daily_audio import audio_tools;print(audio_tools()[0])').Trim()
}
$definitions = (& node --input-type=module -e 'import {foundationDemoDefinitions} from "./src/foundationDemos.ts"; console.log(JSON.stringify(foundationDemoDefinitions))') | ConvertFrom-Json
$output = Join-Path $siteRoot 'public\audio\foundation\demos'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$manifestPath = Join-Path $siteRoot 'public\audio\foundation\demo-manifest.json'
$manifest = @{version=1;entries=@{}}
if (Test-Path -LiteralPath $manifestPath) { $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json -AsHashtable }
$synth = New-Object -ComObject SAPI.SpVoice
$synth.Voice = @($synth.GetVoices() | Where-Object {$_.GetDescription() -eq 'Microsoft David Desktop - English (United States)'})[0]
foreach ($demo in $definitions | Where-Object {-not $Ids.Count -or $_.id -in $Ids}) {
  $target = Join-Path $output ($demo.id + '.mp3')
  $temporaryMp3 = Join-Path ([IO.Path]::GetTempPath()) ('codewords-foundation-' + [guid]::NewGuid().ToString('N') + '.mp3')
  if ($demo.source) {
    $page = (Invoke-WebRequest -Uri $demo.source).Content
    $match = [regex]::Match($page, '(?s)<span class="uk dpron-i .*?<source type="audio/mpeg" src="([^"]+)"')
    if (-not $match.Success) { throw "No UK recording found for $($demo.id)" }
    $url = 'https://dictionary.cambridge.org' + $match.Groups[1].Value
    if ($url -notlike 'https://dictionary.cambridge.org/media/english/uk_pron/*') { throw 'Unexpected audio source' }
    Invoke-WebRequest -Uri $url -OutFile $temporaryMp3
    $manifest.entries[$demo.id] = @{text=$demo.text;voice=$demo.voice;sourcePage=$demo.source;sourceAudio=$url}
  } else {
    # SAPI holds an exclusive lock while writing. Keep temporary files out of
    # public so the Windows Vite watcher never tries to watch that locked file.
    $wav = Join-Path ([IO.Path]::GetTempPath()) ('codewords-foundation-' + [guid]::NewGuid().ToString('N') + '.wav')
    $stream = New-Object -ComObject SAPI.SpFileStream
    $stream.Format.Type = 22 # 22.05 kHz, 16-bit, mono
    $stream.Open($wav, 3)
    $synth.AudioOutputStream = $stream
    try { $null = $synth.Speak($demo.xml, 8) } finally { $stream.Close() }
    & $Ffmpeg -v error -y -i $wav -codec:a libmp3lame -q:a 2 $temporaryMp3
    if ($LASTEXITCODE -ne 0) { throw "Audio encoding failed: $($demo.id)" }
    Remove-Item -LiteralPath $wav
    $manifest.entries[$demo.id] = @{text=$demo.text;voice=$demo.voice;xml=$demo.xml;purpose='Controlled contrast, not a phoneme recording'}
  }
  Move-Item -LiteralPath $temporaryMp3 -Destination $target -Force
  $manifest.entries[$demo.id].fileSha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest.entries[$demo.id].bytes = (Get-Item -LiteralPath $target).Length
  $manifest.entries[$demo.id].generatedAt = [DateTime]::UtcNow.ToString('o')
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM
  Write-Output "Saved $($demo.id)"
}
# JSON.stringify defines the exact version fingerprint used by the build verifier.
& node --input-type=module -e 'import {readFileSync,writeFileSync} from "node:fs";import {createHash} from "node:crypto";import {foundationDemoDefinitions} from "./src/foundationDemos.ts";const p="public/audio/foundation/demo-manifest.json";const m=JSON.parse(readFileSync(p,"utf8"));for(const d of foundationDemoDefinitions)m.entries[d.id].definitionSha256=createHash("sha256").update(JSON.stringify(d)).digest("hex");writeFileSync(p,JSON.stringify(m,null,2)+"\n");writeFileSync("src/foundationDemoVersions.json",JSON.stringify(Object.fromEntries(Object.entries(m.entries).map(([id,r])=>[id,r.fileSha256.slice(0,16)])),null,2)+"\n");'
if ($LASTEXITCODE -ne 0) { throw 'Could not finalize demonstration manifest' }
