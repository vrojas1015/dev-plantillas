<#
.SYNOPSIS
  Arma el workspace del equipo en C:\dev\<Org>: carpetas, CLAUDE.md en capas y clones.
.EXAMPLE
  .\scripts\bootstrap.ps1 -Org mi-org
  .\scripts\bootstrap.ps1 -Org mi-org -Root D:\code -ReposFile .\workspace\repos.txt
#>
param(
  [Parameter(Mandatory)] [string] $Org,
  [string] $Root = 'C:\dev',
  [string] $ReposFile = (Join-Path $PSScriptRoot '..\workspace\repos.txt')
)
$ErrorActionPreference = 'Stop'
$base = Join-Path $Root $Org
$ws   = Join-Path $PSScriptRoot '..\workspace'

$synced = @($env:OneDrive, $env:OneDriveConsumer, $env:OneDriveCommercial) | Where-Object { $_ }
$full = [IO.Path]::GetFullPath($base)
if (($synced | Where-Object { $full.StartsWith($_, 'OrdinalIgnoreCase') }) -or $full -match '\\(Dropbox|iCloudDrive)\\') {
  throw "No uses una carpeta sincronizada: $full"
}

foreach ($d in 'backend','frontend','tools','worktrees') {
  New-Item -ItemType Directory -Force (Join-Path $base $d) | Out-Null
}

# CLAUDE.md en capas: nunca pisa uno existente (puede tener ajustes locales)
foreach ($rel in 'CLAUDE.md','backend\CLAUDE.md','frontend\CLAUDE.md') {
  $dst = Join-Path $base $rel
  if (Test-Path $dst) { Write-Host "= $rel ya existe, no se toca" }
  else { (Get-Content (Join-Path $ws $rel) -Raw) -replace '<ORG>', $Org -replace '<org>', $Org |
           Set-Content -NoNewline -Encoding utf8 $dst; Write-Host "+ $rel" }
}

if (Test-Path $ReposFile) {
  foreach ($line in Get-Content $ReposFile) {
    $line = $line.Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }
    $dir, $url = $line -split '\s+', 2
    $dst = Join-Path $base $dir
    if (Test-Path (Join-Path $dst '.git')) { Write-Host "= $dir ya clonado"; continue }
    git clone $url $dst
  }
} else {
  Write-Host "Sin ${ReposFile}: copiá workspace\repos.example.txt a repos.txt para clonar repos."
}
Write-Host "`nListo: $base"
