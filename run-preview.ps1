# run-preview.ps1 - 构建并预览油耗记录网站（生产模式）
# 由 run-preview.bat 双击调用。脚本所在目录即项目根目录。
$ErrorActionPreference = 'Stop'

$projectDir = $PSScriptRoot
Set-Location -Path $projectDir

function Write-Info($msg) { Write-Host ("==> " + $msg) -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host ("==> " + $msg) -ForegroundColor Green }
function Write-Err($msg)  { Write-Host ("!! " + $msg) -ForegroundColor Red }

Write-Info "正在检查运行环境 (Node.js / npm)…"

$node = Get-Command -Name node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Err "未检测到 Node.js。请先安装 Node.js：https://nodejs.org ，然后重试。"
    exit 1
}
$npm = Get-Command -Name npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
    Write-Err "未检测到 npm（通常随 Node.js 一起安装）。请重新安装 Node.js。"
    exit 1
}

Write-Ok ("Node " + (node --version) + " / npm " + (npm.cmd --version) + " 已就绪")

# 首次或依赖缺失时自动安装
if (-not (Test-Path -Path (Join-Path $projectDir "node_modules"))) {
    Write-Info "首次运行，正在安装依赖（可能需要几分钟，请保持网络畅通）…"
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) {
        Write-Err "依赖安装失败，请检查网络后重试。"
        exit 1
    }
    Write-Ok "依赖安装完成"
}

Write-Info "正在执行生产构建 (npm run build)…"
& npm.cmd run build
if ($LASTEXITCODE -ne 0) {
    Write-Err "构建失败，请查看上方错误信息。"
    exit 1
}
Write-Ok "构建成功！"

Write-Info "正在启动预览服务器 (npm run preview)…"
$proc = Start-Process -FilePath "npm.cmd" -ArgumentList "run","preview" -NoNewWindow -PassThru

Write-Info "等待服务器就绪并自动打开浏览器…"
Start-Sleep -Seconds 4
try {
    Start-Process -FilePath "http://localhost:4173"
    Write-Ok "已在默认浏览器打开 http://localhost:4173"
} catch {
    Write-Info "请手动在浏览器访问 http://localhost:4173"
}

Write-Host ""
Write-Host "预览服务器运行中。关闭本窗口或按 Ctrl+C 即可停止。" -ForegroundColor Yellow
Write-Host ""

try {
    $proc.WaitForExit()
} finally {
    if ($proc -and -not $proc.HasExited) {
        $proc | Stop-Process -Force
    }
}

Write-Ok "预览服务器已停止。"
