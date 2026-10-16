$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
& node (Join-Path $PSScriptRoot 'check.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Checks failed; no package created.' }
$taskManifest = Get-Content -LiteralPath (Join-Path $taskRoot 'manifest.json') -Raw | ConvertFrom-Json
$taskFiles = @('manifest.json', 'options.html', 'options.js', 'submit.html', 'submit.js', $taskManifest.background.service_worker)
foreach ($taskScript in $taskManifest.content_scripts) { $taskFiles += @($taskScript.js); $taskFiles += @($taskScript.css) }
foreach ($taskResource in $taskManifest.web_accessible_resources) { $taskFiles += @($taskResource.resources) }
$taskFiles = @($taskFiles | Where-Object { $_ } | Sort-Object -Unique)
$taskPaths = @($taskFiles | ForEach-Object { Join-Path $taskRoot $_ })
$taskDist = Join-Path $taskRoot 'dist'
New-Item -ItemType Directory -Path $taskDist -Force | Out-Null
$taskArchive = Join-Path $taskDist ('bravely-' + $taskManifest.version + '-unpacked.zip')
Compress-Archive -LiteralPath $taskPaths -DestinationPath $taskArchive -Force
Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256
