param([string]$Output = (Join-Path $PSScriptRoot '..\bin'), [switch]$Distribution)

$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Output = [IO.Path]::GetFullPath($Output)
New-Item -ItemType Directory -Path $Output -Force | Out-Null
$editions = @(
    @{ Name = 'gm'; Tags = 'gm'; File = 'easel-gm.exe' },
    @{ Name = 'group'; Tags = 'group'; File = 'easel-group.exe' },
    @{ Name = 'unrestricted'; Tags = ''; File = 'easel.exe' }
)
Push-Location $workspace
try {
    foreach ($edition in $editions) {
        $target = Join-Path $Output $edition.File
        if ($edition.Tags) { & go build -trimpath -tags $edition.Tags -o $target ./cmd/easel } else { & go build -trimpath -o $target ./cmd/easel }
        if ($LASTEXITCODE -ne 0) { throw "Building the $($edition.Name) edition failed." }
        Write-Output "built $target"
        if ($Distribution) {
            $root = Join-Path $Output ("dist\easel-" + $edition.Name)
            if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
            New-Item -ItemType Directory -Path (Join-Path $root 'config'), (Join-Path $root 'games') -Force | Out-Null
            Copy-Item -LiteralPath $target -Destination (Join-Path $root 'easel.exe')
            Copy-Item -LiteralPath (Join-Path $workspace 'server\easel') -Destination (Join-Path $root 'easel') -Recurse
            Get-ChildItem -LiteralPath (Join-Path $workspace 'server\config') -Filter '*.example.json' | Copy-Item -Destination (Join-Path $root 'config')
            Copy-Item -LiteralPath (Join-Path $workspace 'design\operations.md') -Destination (Join-Path $root 'OPERATIONS.md')
            Write-Output "assembled $root"
        }
    }
} finally { Pop-Location }
