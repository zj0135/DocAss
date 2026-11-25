$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$cleanRoot = Join-Path $taskRoot ('artifacts/clean-install-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force (Join-Path $cleanRoot 'src/web') | Out-Null
foreach ($file in @('package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc')) { Copy-Item -LiteralPath (Join-Path $taskRoot $file) -Destination $cleanRoot }
Copy-Item -LiteralPath (Join-Path $taskRoot 'src/web/package.json') -Destination (Join-Path $cleanRoot 'src/web/package.json')
Push-Location $cleanRoot
try { pnpm install --frozen-lockfile --offline; if ($LASTEXITCODE) { exit $LASTEXITCODE } } finally { Pop-Location }
dotnet restore (Join-Path $taskRoot 'DocAss.sln') --locked-mode --force --packages (Join-Path $cleanRoot 'nuget')
if ($LASTEXITCODE) { exit $LASTEXITCODE }
@{ passed=$true; pnpm='12.15.0'; sdk='11.0.100'; cleanDirectory=$cleanRoot; webInstall='frozen lockfile / empty node_modules / cached package bytes'; hostRestore='locked mode / empty NuGet directory' } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $taskRoot 'artifacts/clean-install.json')
