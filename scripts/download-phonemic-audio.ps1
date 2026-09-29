$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$outputRoot = Join-Path $projectRoot 'public/audio/phonemes'
$recordingRoot = Join-Path $outputRoot 'uk'
New-Item -ItemType Directory -Path $recordingRoot -Force | Out-Null
Push-Location $projectRoot
try {
  $inventory = @'
import { phonemes, phonemeAudioURL, phonemicSource } from './src/phonemeInventory.ts';
console.log(JSON.stringify(phonemes.flatMap(item => ['sound', 'word'].map(kind => ({
  id: item.id, ipa: item.ipa, word: item.word, kind, sourcePage: phonemicSource,
  sourceURL: phonemeAudioURL(item.id, kind), file: `uk/uk_phonetics_${kind}_${item.file}.mp3`
})))));
'@ | node --input-type=module | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $inventory.Count -ne 88) { throw 'Expected 88 recording entries' }
  $manifestPath = Join-Path $outputRoot 'manifest.json'
  $previous = if (Test-Path -LiteralPath $manifestPath) { Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json } else { $null }
  $records = [System.Collections.Generic.List[object]]::new()
  foreach ($item in $inventory) {
    $target = Join-Path $outputRoot $item.file
    $saved = @($previous.entries | Where-Object { $_.file -eq $item.file -and $_.sourceURL -eq $item.sourceURL }) | Select-Object -First 1
    $valid = $saved -and (Test-Path -LiteralPath $target) -and ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -eq $saved.sha256)
    if (-not $valid) {
      $temporary = "$target.download"
      for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
          $response = Invoke-WebRequest -Uri $item.sourceURL -OutFile $temporary -PassThru -TimeoutSec 30
          break
        } catch {
          if ($attempt -eq 3 -or $_.Exception.Response.StatusCode.value__ -in @(401,403)) { throw }
          Write-Output "Retry $attempt for $($item.file): $($_.Exception.GetType().Name)"
          Start-Sleep -Seconds $attempt
        }
      }
      if ($response.StatusCode -ne 200 -or (Get-Item -LiteralPath $temporary).Length -lt 100) { throw "Invalid recording: $($item.file)" }
      Move-Item -LiteralPath $temporary -Destination $target -Force
    }
    $record = [ordered]@{}
    foreach ($property in $item.PSObject.Properties) { $record[$property.Name] = $property.Value }
    $record.bytes = (Get-Item -LiteralPath $target).Length
    $record.sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    $record.downloadedAt = if ($valid) { $saved.downloadedAt } else { (Get-Date).ToUniversalTime().ToString('o') }
    $records.Add($record)
    @{ version = 1; source = 'Cambridge Dictionary UK pronunciation guide'; entries = @($records.ToArray()) } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$manifestPath.tmp" -Encoding utf8
    Move-Item -LiteralPath "$manifestPath.tmp" -Destination $manifestPath -Force
    if ($records.Count % 10 -eq 0 -or $records.Count -eq 88) { Write-Output "Saved $($records.Count)/88 recordings" }
  }
} finally { Pop-Location }
