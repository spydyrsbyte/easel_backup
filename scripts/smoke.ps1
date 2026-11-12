param([string]$PostgresBin = (Join-Path $env:LOCALAPPDATA 'Easel/PostgreSQL18/pgsql/bin'))

$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$root = Join-Path $workspace ('bin/smoke-' + [guid]::NewGuid().ToString('N'))
$dataPath = Join-Path $root 'data'
$easelDir = Join-Path $workspace 'server/easel'
$started = $false
$process = $null
$failed = $true

function Free-Port {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = $listener.LocalEndpoint.Port
    $listener.Stop()
    return $port
}

function Check([bool]$condition, [string]$message) {
    if (-not $condition) { throw "smoke check failed: $message" }
    Write-Output "ok  $message"
}

function Write-Config([string]$directory, [string]$database, [int]$port) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    @{ host = '127.0.0.1'; port = $port; database = $database; user = 'easel_smoke'; password = ''; sslmode = 'disable' } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory 'database.json') -Encoding ASCII
}

function Start-Easel([string]$executable, [string]$config, [string]$games, [int]$port, [string]$log) {
    $arguments = @('serve', '-addr', "127.0.0.1:$port", '-database-config', (Join-Path $config 'database.json'), '-auth-config', (Join-Path $config 'auth.json'), '-easel-dir', $easelDir, '-games-dir', $games)
    $started = Start-Process -FilePath $executable -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardError $log -RedirectStandardOutput ($log + '.out')
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        if ($started.HasExited) { throw "Easel exited during startup:`n$(Get-Content -LiteralPath $log -Raw)" }
        try {
            if ((Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { return $started }
        } catch { Start-Sleep -Milliseconds 300 }
    }
    throw "Easel did not answer on port ${port}:`n$(Get-Content -LiteralPath $log -Raw)"
}

function Stop-Easel($running) {
    if ($running -and -not $running.HasExited) {
        Stop-Process -Id $running.Id -Force
        $running.WaitForExit()
    }
}

function Invoke-Easel([string]$executable, [string[]]$arguments) {
    $output = & $executable @arguments
    if ($LASTEXITCODE -ne 0) { throw "easel $($arguments -join ' ') failed" }
    return ($output -join "`n")
}

New-Item -ItemType Directory -Path $root -Force | Out-Null
try {
    & (Join-Path $PSScriptRoot 'build.ps1') | Out-Null
    $gm = Join-Path $workspace 'bin/easel-gm.exe'
    $group = Join-Path $workspace 'bin/easel-group.exe'
    $unrestricted = Join-Path $workspace 'bin/easel.exe'
    Check ((Invoke-Easel $gm @('version')) -match '"edition": "GM"') 'the GM edition reports itself'
    Check ((Invoke-Easel $group @('version')) -match '"edition": "Group"') 'the Group edition reports itself'
    Check ((Invoke-Easel $unrestricted @('version')) -match '"edition": "Unrestricted"') 'the Unrestricted edition reports itself'

    & (Join-Path $PostgresBin 'initdb.exe') -D $dataPath -U easel_smoke -A trust -E UTF8 --no-locale | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Temporary PostgreSQL initialization failed.' }
    $databasePort = Free-Port
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $dataPath -l (Join-Path $root 'postgres.log') -o "-h 127.0.0.1 -p $databasePort" -w start
    if ($LASTEXITCODE -ne 0) { throw 'Temporary PostgreSQL startup failed.' }
    $started = $true
    & (Join-Path $PostgresBin 'createdb.exe') -h 127.0.0.1 -p $databasePort -U easel_smoke restored
    if ($LASTEXITCODE -ne 0) { throw 'Creating the restore database failed.' }

    $config = Join-Path $root 'config'
    $games = Join-Path $root 'games'
    Write-Config $config 'postgres' $databasePort
    $common = @('-database-config', (Join-Path $config 'database.json'), '-easel-dir', $easelDir, '-games-dir', $games)
    $port = Free-Port
    $base = "http://127.0.0.1:$port"
    $headers = @{ Origin = $base }

    $process = Start-Easel $gm $config $games $port (Join-Path $root 'gm.log')
    Check $true 'a clean database is initialized and the GM edition serves the sign-in page'
    $account = Invoke-RestMethod -Uri "$base/api/accounts" -Method Post -ContentType 'application/json' -Headers $headers -Body '{"username":"smoke","password":"correct horse battery"}' -SessionVariable session
    Check ($account.user.id.Length -eq 36) 'an account is created'
    Check ((Invoke-RestMethod -Uri "$base/api/me" -WebSession $session).user.id -eq $account.user.id) 'the session cookie signs the account in'
    $listed = (Invoke-Easel $gm (@('games') + $common)) | ConvertFrom-Json
    Check ($listed.Count -eq 1 -and $listed[0].name -eq 'Demo table' -and $listed[0].lifecycle -eq 'auto') 'the default server created and started its demo table'
    Stop-Easel $process
    $process = $null

    $process = Start-Easel $unrestricted $config $games $port (Join-Path $root 'unrestricted.log')
    Check ((Invoke-RestMethod -Uri "$base/api/me" -WebSession $session).user.id -eq $account.user.id) 'the session survives a crash and a change of edition'
    $login = Invoke-RestMethod -Uri "$base/api/sessions" -Method Post -ContentType 'application/json' -Headers $headers -Body '{"username":"smoke","password":"correct horse battery"}'
    Check ($login.user.id -eq $account.user.id) 'the account signs in under another edition'
    $after = (Invoke-Easel $unrestricted (@('games') + $common)) | ConvertFrom-Json
    Check ($after[0].id -eq $listed[0].id) 'games are preserved across editions'
    $backup = Join-Path $root 'backup.zip'
    $header = (Invoke-Easel $unrestricted (@('backup', '-out', $backup) + $common)) | ConvertFrom-Json
    Check ((Test-Path -LiteralPath $backup) -and $header.rows.'accounts.users' -eq 1) 'a backup is written while Easel runs'
    $installed = (Invoke-Easel $unrestricted (@('packages', 'list') + $common)) | ConvertFrom-Json
    Check (($installed | Where-Object { $_.package.problem }).Count -eq 0 -and $installed.Count -gt 5) 'every installed package validates'
    Stop-Easel $process
    $process = $null

    $restoredConfig = Join-Path $root 'restored-config'
    $restoredGames = Join-Path $root 'restored-games'
    Write-Config $restoredConfig 'restored' $databasePort
    $restoredCommon = @('-database-config', (Join-Path $restoredConfig 'database.json'), '-easel-dir', $easelDir, '-games-dir', $restoredGames)
    $report = (Invoke-Easel $group (@('restore', '-in', $backup) + $restoredCommon)) | ConvertFrom-Json
    Check ($report.archive.rows.'game_data.games' -ge 2) 'the backup restores into a clean database'
    $process = Start-Easel $group $restoredConfig $restoredGames $port (Join-Path $root 'group.log')
    $login = Invoke-RestMethod -Uri "$base/api/sessions" -Method Post -ContentType 'application/json' -Headers $headers -Body '{"username":"smoke","password":"correct horse battery"}'
    Check ($login.user.id -eq $account.user.id) 'the restored installation signs the account in under the Group edition'
    $restored = (Invoke-Easel $group (@('games') + $restoredCommon)) | ConvertFrom-Json
    Check ($restored[0].id -eq $listed[0].id) 'the restored installation has the same game'
    Stop-Easel $process
    $process = $null
    $failed = $false
    Write-Output 'Smoke test passed: clean install, sign-in, crash recovery, edition replacement, backup, restore.'
} finally {
    Stop-Easel $process
    $canClean = -not $started
    if ($started) {
        & (Join-Path $PostgresBin 'pg_ctl.exe') -D $dataPath -m fast -w stop
        $canClean = $LASTEXITCODE -eq 0
    }
    $resolved = [IO.Path]::GetFullPath($root)
    $allowed = [IO.Path]::GetFullPath((Join-Path $workspace 'bin/smoke-'))
    if (-not $resolved.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing cleanup outside the generated smoke directory.' }
    if ($canClean -and -not $failed) { Remove-Item -LiteralPath $resolved -Recurse -Force }
    elseif ($failed) { Write-Output "Logs kept in $resolved" }
}
if ($failed) { exit 1 }
exit 0
