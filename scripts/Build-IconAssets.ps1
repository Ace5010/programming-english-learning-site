param()
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$sourcePath = Join-Path $root 'design\cijian-icon\source.png'
$output = Join-Path $root 'public\icons'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$source = [Drawing.Bitmap]::FromFile($sourcePath)

function New-IconPng([int]$size) {
    $bitmap = New-Object Drawing.Bitmap($size, $size, ([Drawing.Imaging.PixelFormat]::Format32bppArgb))
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $stream = New-Object IO.MemoryStream
    try {
        $graphics.Clear([Drawing.Color]::Transparent)
        $graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($source, [Drawing.Rectangle]::new(0, 0, $size, $size))
        $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
        return ,$stream.ToArray()
    } finally { $graphics.Dispose(); $bitmap.Dispose(); $stream.Dispose() }
}

try {
    foreach ($size in @(32, 180, 192, 512)) {
        [IO.File]::WriteAllBytes((Join-Path $output "cijian-book-a-v2-$size.png"), (New-IconPng $size))
    }
    $sizes = @(16, 24, 32, 48, 64, 96, 128, 256)
    $images = @($sizes | ForEach-Object { ,(New-IconPng $_) })
    $stream = New-Object IO.MemoryStream
    $writer = New-Object IO.BinaryWriter($stream)
    try {
        $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
        $offset = 6 + 16 * $sizes.Count
        for ($index = 0; $index -lt $sizes.Count; $index++) {
            $dimension = $(if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] })
            $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
            $writer.Write([byte]0); $writer.Write([byte]0)
            $writer.Write([uint16]1); $writer.Write([uint16]32)
            $writer.Write([uint32]$images[$index].Length); $writer.Write([uint32]$offset)
            $offset += $images[$index].Length
        }
        foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
        $writer.Flush()
        $ico = $stream.ToArray()
        [IO.File]::WriteAllBytes((Join-Path $output 'cijian-book-a-v2.ico'), $ico)
        [IO.File]::WriteAllBytes((Join-Path $root 'public\favicon.ico'), $ico)
    } finally { $writer.Dispose(); $stream.Dispose() }
    $android = Join-Path $root 'android\app\src\main\res\drawable-nodpi'
    New-Item -ItemType Directory -Path $android -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $output 'cijian-book-a-v2-512.png') -Destination (Join-Path $android 'cijian_icon.png') -Force
    Write-Output "Icon assets generated: $output"
} finally { $source.Dispose() }
