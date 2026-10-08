<#
.SYNOPSIS
  Crea los worktrees de un issue: uno por repo, todos bajo worktrees\issue-<n>.
.EXAMPLE
  .\scripts\new-worktree.ps1 -Issue 42 -Slug descuentos -Repos backend\protos,backend\orders-service
#>
param(
  [Parameter(Mandatory)] [int] $Issue,
  [Parameter(Mandatory)] [string] $Slug,
  [Parameter(Mandatory)] [string[]] $Repos,
  [string] $Base = (Get-Location).Path,
  [ValidateSet('feat','fix','chore')] [string] $Type = 'feat'
)
$ErrorActionPreference = 'Stop'
$branch = "$Type/issue-$Issue-$Slug"
$target = Join-Path $Base "worktrees\issue-$Issue"
New-Item -ItemType Directory -Force $target | Out-Null
foreach ($r in $Repos) {
  $repo = Join-Path $Base $r
  $name = Split-Path $r -Leaf
  git -C $repo fetch origin main --quiet
  git -C $repo worktree add --no-track (Join-Path $target $name) -b $branch origin/main
}
Write-Host "`nAbrí la sesión en: $target"
