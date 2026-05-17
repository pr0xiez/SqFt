# Auto-link .env* files from the main SqFt checkout into any worktree of it.
# Hardlinks (same drive) so edits in either place stay in sync.
# Idempotent — safe to run every session. Returns silently when cwd isn't a SqFt worktree.

$ErrorActionPreference = 'Stop'

$mainRoot = (Resolve-Path "$PSScriptRoot\..").Path
$worktreesRoot = Join-Path $mainRoot '.claude\worktrees'
$cwd = (Get-Location).Path

if (-not $cwd.StartsWith($worktreesRoot, [StringComparison]::OrdinalIgnoreCase)) {
    return
}

$rel = $cwd.Substring($worktreesRoot.Length).TrimStart('\', '/')
$worktreeName = ($rel -split '[\\/]')[0]
if (-not $worktreeName) { return }
$worktreeDir = Join-Path $worktreesRoot $worktreeName

$linked = @()
Get-ChildItem -Path $mainRoot -Filter '.env*' -File -Force | ForEach-Object {
    $dst = Join-Path $worktreeDir $_.Name
    if (-not (Test-Path -LiteralPath $dst)) {
        New-Item -ItemType HardLink -Path $dst -Target $_.FullName -Force | Out-Null
        $linked += $_.Name
    }
}

if ($linked.Count -gt 0) {
    Write-Host ("sync-env: linked " + ($linked -join ', ') + " into " + $worktreeName)
}
