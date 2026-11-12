$ErrorActionPreference = 'Stop'

$serverDirectory = Join-Path $PSScriptRoot 'server'
$databaseScript = Join-Path $PSScriptRoot 'scripts\database.ps1'
$databaseConfiguration = 'config\database.json'
for ($argumentIndex = 0; $argumentIndex -lt $args.Count; $argumentIndex++) {
    if ($args[$argumentIndex] -match '^--?database-config=(.+)$') {
        $databaseConfiguration = $Matches[1]
    } elseif ($args[$argumentIndex] -match '^--?database-config$' -and $argumentIndex + 1 -lt $args.Count) {
        $argumentIndex++
        $databaseConfiguration = $args[$argumentIndex]
    }
}
if (-not [IO.Path]::IsPathRooted($databaseConfiguration)) {
    $databaseConfiguration = Join-Path $serverDirectory $databaseConfiguration
}
$stopDatabase = $false
$applicationExitCode = 1
Push-Location $serverDirectory
try {
    if (Test-Path -LiteralPath $databaseConfiguration) {
        $databaseSettings = Get-Content -LiteralPath $databaseConfiguration -Raw | ConvertFrom-Json
        if ($databaseSettings.host -in @('127.0.0.1', 'localhost', '::1') -and $databaseSettings.port -eq 5432) {
            & $databaseScript status *> $null
            $databaseWasRunning = $LASTEXITCODE -eq 0
            & $databaseScript start
            if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed; Easel was not started.' }
            $stopDatabase = -not $databaseWasRunning
        }
    }
    go run (Join-Path $PSScriptRoot 'cmd\easel') @args
    $applicationExitCode = $LASTEXITCODE
} finally {
    try {
        if ($stopDatabase) {
            & $databaseScript stop
            if ($LASTEXITCODE -ne 0) {
                Write-Warning 'PostgreSQL did not shut down cleanly. Run scripts\database.ps1 status to inspect it.'
                if ($applicationExitCode -eq 0) { $applicationExitCode = 1 }
            }
        }
    } finally { Pop-Location }
}

exit $applicationExitCode
