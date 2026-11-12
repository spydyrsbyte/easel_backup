param([string]$PostgresBin = (Join-Path $env:LOCALAPPDATA 'Easel/PostgreSQL18/pgsql/bin'), [string]$Run = '.')

$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testRoot = Join-Path $workspace ('bin/security-postgres-' + [guid]::NewGuid().ToString('N'))
$dataPath = Join-Path $testRoot 'data'
$configPath = Join-Path $testRoot 'database.json'
$previousConfig = $env:EASEL_TEST_DATABASE_CONFIG
$started = $false
$testExitCode = 1
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
try {
    & (Join-Path $PostgresBin 'initdb.exe') -D $dataPath -U easel_security_test -A trust -E UTF8 --no-locale | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Temporary PostgreSQL initialization failed.' }
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $testPort = $listener.LocalEndpoint.Port
    $listener.Stop()
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $dataPath -l (Join-Path $testRoot 'postgres.log') -o "-h 127.0.0.1 -p $testPort" -w start
    if ($LASTEXITCODE -ne 0) { throw 'Temporary PostgreSQL startup failed.' }
    $started = $true
    @{ host = '127.0.0.1'; port = $testPort; database = 'postgres'; user = 'easel_security_test'; password = ''; sslmode = 'disable' } |
        ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding ASCII
    $env:EASEL_TEST_DATABASE_CONFIG = $configPath
    Push-Location $workspace
    try {
        & go test ./... -count=1 -run $Run
        $testExitCode = $LASTEXITCODE
    } finally { Pop-Location }
} finally {
    $env:EASEL_TEST_DATABASE_CONFIG = $previousConfig
    $canClean = -not $started
    if ($started) {
        & (Join-Path $PostgresBin 'pg_ctl.exe') -D $dataPath -m fast -w stop
        $canClean = $LASTEXITCODE -eq 0
    }
    $resolvedTestRoot = [IO.Path]::GetFullPath($testRoot)
    $allowedPrefix = [IO.Path]::GetFullPath((Join-Path $workspace 'bin/security-postgres-'))
    if (-not $resolvedTestRoot.StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing cleanup outside the generated test directory.'
    }
    if ($canClean) { Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force }
}
exit $testExitCode
