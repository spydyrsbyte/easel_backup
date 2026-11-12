param([ValidateSet('start', 'stop', 'restart', 'status')][string]$Action = 'status', [int]$Port = 5199, [string]$PostgresBin = (Join-Path $env:LOCALAPPDATA 'Easel/PostgreSQL18/pgsql/bin'))

$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$root = Join-Path $workspace 'bin/dev'
$dataPath = Join-Path $root 'data'
$config = Join-Path $root 'config'
$games = Join-Path $root 'games'
$pidFile = Join-Path $root 'easel.pid'
$portFile = Join-Path $root 'postgres.port'
$control = Join-Path $PostgresBin 'pg_ctl.exe'

function Stop-Server {
    if (Test-Path -LiteralPath $pidFile) {
        $id = [int](Get-Content -LiteralPath $pidFile)
        $running = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($running -and $running.ProcessName -like 'easel*') { Stop-Process -Id $id -Force; $running.WaitForExit() }
        Remove-Item -LiteralPath $pidFile -Force
    }
}

function Database-Running {
    if (-not (Test-Path -LiteralPath $dataPath)) { return $false }
    & $control -D $dataPath status *> $null
    return $LASTEXITCODE -eq 0
}

function Start-Server {
    New-Item -ItemType Directory -Path $root, $config, $games -Force | Out-Null
    if (-not (Test-Path -LiteralPath $dataPath)) {
        & (Join-Path $PostgresBin 'initdb.exe') -D $dataPath -U easel_dev -A trust -E UTF8 --no-locale | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Development PostgreSQL initialization failed.' }
    }
    if (-not (Database-Running)) {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
        $listener.Start()
        $databasePort = $listener.LocalEndpoint.Port
        $listener.Stop()
        Set-Content -LiteralPath $portFile -Value $databasePort -Encoding ASCII
        & $control -D $dataPath -l (Join-Path $root 'postgres.log') -o "-h 127.0.0.1 -p $databasePort" -w start
        if ($LASTEXITCODE -ne 0) { throw 'Development PostgreSQL startup failed.' }
    }
    $databasePort = [int](Get-Content -LiteralPath $portFile)
    @{ host = '127.0.0.1'; port = $databasePort; database = 'postgres'; user = 'easel_dev'; password = ''; sslmode = 'disable' } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $config 'database.json') -Encoding ASCII
    $executable = Join-Path $root 'easel.exe'
    Push-Location $workspace
    try {
        & go build -o $executable ./cmd/easel
        if ($LASTEXITCODE -ne 0) { throw 'Building Easel failed.' }
    } finally { Pop-Location }
    $log = Join-Path $root 'easel.log'
    $arguments = @('serve', '-addr', "127.0.0.1:$Port", '-database-config', (Join-Path $config 'database.json'), '-auth-config', (Join-Path $config 'auth.json'), '-easel-dir', (Join-Path $workspace 'server/easel'), '-games-dir', $games)
    $started = Start-Process -FilePath $executable -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardError $log -RedirectStandardOutput ($log + '.out')
    Set-Content -LiteralPath $pidFile -Value $started.Id -Encoding ASCII
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        if ($started.HasExited) { throw "Easel exited during startup:`n$(Get-Content -LiteralPath $log -Raw)" }
        try {
            if ((Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) {
                Write-Output "Easel is serving http://127.0.0.1:$Port"
                return
            }
        } catch { Start-Sleep -Milliseconds 250 }
    }
    throw "Easel did not answer on port ${Port}:`n$(Get-Content -LiteralPath $log -Raw)"
}

switch ($Action) {
    'start' { Stop-Server; Start-Server }
    'restart' { Stop-Server; Start-Server }
    'stop' {
        Stop-Server
        if (Database-Running) { & $control -D $dataPath -m fast -w stop }
        Write-Output 'Stopped.'
    }
    'status' {
        $serving = (Test-Path -LiteralPath $pidFile) -and (Get-Process -Id ([int](Get-Content -LiteralPath $pidFile)) -ErrorAction SilentlyContinue)
        Write-Output ("easel: " + $(if ($serving) { "running on http://127.0.0.1:$Port" } else { 'stopped' }))
        Write-Output ("postgres: " + $(if (Database-Running) { 'running' } else { 'stopped' }))
    }
}
