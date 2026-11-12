param([ValidateSet('start', 'stop', 'status', 'shell')][string]$Action = 'status')

$ErrorActionPreference = 'Stop'
$installRoot = Join-Path $env:LOCALAPPDATA 'Easel\PostgreSQL18'
$binaryDirectory = Join-Path $installRoot 'pgsql\bin'
$dataDirectory = Join-Path $installRoot 'data'
$controlProgram = Join-Path $binaryDirectory 'pg_ctl.exe'
if (-not (Test-Path $controlProgram)) { throw "PostgreSQL is not installed at $installRoot" }

switch ($Action) {
    'start' {
        & $controlProgram -D $dataDirectory status *> $null
        if ($LASTEXITCODE -eq 0) { Write-Output 'PostgreSQL is already running.'; exit 0 }
        & $controlProgram -D $dataDirectory -l (Join-Path $installRoot 'postgresql.log') -w start
    }
    'stop' { & $controlProgram -D $dataDirectory -m fast -w stop }
    'status' { & $controlProgram -D $dataDirectory status }
    'shell' {
        $configurationPath = Join-Path $PSScriptRoot '..\server\config\database.json'
        if (-not (Test-Path $configurationPath)) { throw "Missing database settings at $configurationPath." }
        $connectionSettings = Get-Content $configurationPath -Raw | ConvertFrom-Json
        $previousPassword = $env:PGPASSWORD
        $previousSSLMode = $env:PGSSLMODE
        try {
            $env:PGPASSWORD = $connectionSettings.password
            $env:PGSSLMODE = $connectionSettings.sslmode
            & (Join-Path $binaryDirectory 'psql.exe') -h $connectionSettings.host -p $connectionSettings.port -U $connectionSettings.user -d $connectionSettings.database
        } finally {
            $env:PGPASSWORD = $previousPassword
            $env:PGSSLMODE = $previousSSLMode
        }
    }
}
exit $LASTEXITCODE
