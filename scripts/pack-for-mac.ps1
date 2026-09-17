# 打包给 Mac 用的工程压缩包（排除 node_modules / android / out / .next 等）
# 注意：本脚本不要写中文字面量路径，改由脚本自身位置推导，避免 PS5.1 以 GBK 读取 UTF-8 脚本时乱码。
$ErrorActionPreference = 'Stop'

$src = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path (Split-Path -Parent $src) 'ranjing-for-mac'
$dst = Join-Path (Split-Path -Parent $src) 'ranjing-for-mac.zip'

Set-Location $src
Write-Output "SOURCE = $src"

if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory $tmp | Out-Null

# 需要带走的目录
$dirs = @('src', 'public', 'app', 'scripts')
foreach ($d in $dirs) {
  if (Test-Path $d) {
    Copy-Item $d $tmp -Recurse -Force
    Write-Output "[dir]  $d"
  }
}

# 需要带走的单文件
$files = @(
  'package.json',
  'package-lock.json',
  'next.config.ts',
  'tsconfig.json',
  'postcss.config.mjs',
  '.env.local',
  '.gitignore',
  'capacitor.config.ts'
)
foreach ($f in $files) {
  if (Test-Path $f) {
    Copy-Item $f $tmp -Force
    Write-Output "[file] $f"
  }
}

if (Test-Path $dst) { Remove-Item $dst -Force }
Compress-Archive -Path "$tmp\*" -DestinationPath $dst -CompressionLevel Optimal -Force

$sizeMB = [Math]::Round((Get-Item $dst).Length / 1MB, 2)
Write-Output "DONE -> $dst ($sizeMB MB)"
