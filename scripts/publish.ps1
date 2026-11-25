$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
pnpm install --frozen-lockfile
if ($LASTEXITCODE) { exit $LASTEXITCODE }
pnpm build
if ($LASTEXITCODE) { exit $LASTEXITCODE }
dotnet restore DocAss.sln --locked-mode
if ($LASTEXITCODE) { exit $LASTEXITCODE }
dotnet restore src/host/DocAss.Host -r win-x64 -p:SelfContained=true --locked-mode
if ($LASTEXITCODE) { exit $LASTEXITCODE }
$workspacePath = (Get-Location).Path
$publishPath = [IO.Path]::GetFullPath((Join-Path $workspacePath 'artifacts/publish/win-x64'))
if ($publishPath -ne (Join-Path $workspacePath 'artifacts\publish\win-x64')) { throw 'Unexpected publish output directory' }
if (Test-Path -LiteralPath $publishPath) { Remove-Item -LiteralPath $publishPath -Recurse -Force }
dotnet publish src/host/DocAss.Host -c Release -r win-x64 --self-contained true --no-restore -o artifacts/publish/win-x64
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Get-ChildItem artifacts/publish/win-x64 -File -Recurse | ForEach-Object {
  [PSCustomObject]@{ path = $_.FullName.Substring((Resolve-Path artifacts/publish/win-x64).Path.Length + 1); sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
} | ConvertTo-Json | Set-Content -Encoding UTF8 artifacts/publish/manifest.json
