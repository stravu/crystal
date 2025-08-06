# PowerShell script to test the Windows binary
param(
    [string]$ExePath = ".\dist-electron\Crystal*.exe",
    [switch]$DownloadFromCI,
    [string]$RunId,
    [switch]$Headed,
    [string]$TestPattern = "windows-binary"
)

Write-Host "Crystal Windows Binary Testing Script" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

# Function to download artifact from GitHub Actions
function Download-CIArtifact {
    param([string]$RunId)
    
    Write-Host "`nDownloading artifact from GitHub Actions run: $RunId" -ForegroundColor Yellow
    
    # Download using gh CLI
    $artifactName = "crystal-windows-test"
    gh run download $RunId -n $artifactName -D "./test-artifacts" -R Sallvainian/crystal
    
    # Find the exe
    $downloadedExe = Get-ChildItem -Path "./test-artifacts" -Filter "*.exe" -Recurse | Select-Object -First 1
    if (-not $downloadedExe) {
        throw "No exe file found in downloaded artifacts"
    }
    
    return $downloadedExe.FullName
}

# Check if we need to download from CI
if ($DownloadFromCI) {
    if (-not $RunId) {
        Write-Host "Getting latest workflow run..." -ForegroundColor Yellow
        $latestRun = gh run list --workflow="test-windows-build.yml" --limit 1 --json databaseId --jq ".[0].databaseId" -R Sallvainian/crystal
        $RunId = $latestRun
    }
    
    $ExePath = Download-CIArtifact -RunId $RunId
}

# Find the exe file
$exeFile = Get-ChildItem -Path $ExePath | Select-Object -First 1
if (-not $exeFile) {
    Write-Host "ERROR: Crystal.exe not found at: $ExePath" -ForegroundColor Red
    Write-Host "Build the application first with: pnpm build:win" -ForegroundColor Yellow
    exit 1
}

Write-Host "`nTesting Crystal executable: $($exeFile.FullName)" -ForegroundColor Green
Write-Host "File size: $([math]::Round($exeFile.Length / 1MB, 2)) MB" -ForegroundColor Gray

# Set environment variable for tests
$env:CRYSTAL_EXE_PATH = $exeFile.FullName

# Prepare test command
$testCmd = "pnpm playwright test --config=playwright.windows-binary.config.ts"

if ($TestPattern) {
    $testCmd += " -g `"$TestPattern`""
}

if ($Headed) {
    $testCmd += " --headed"
}

Write-Host "`nRunning tests with command:" -ForegroundColor Yellow
Write-Host $testCmd -ForegroundColor White

# Create test results directory
New-Item -ItemType Directory -Force -Path "test-results/screenshots" | Out-Null

# Run the tests
Write-Host "`nStarting Playwright tests..." -ForegroundColor Cyan
Invoke-Expression $testCmd

# Check test results
if ($LASTEXITCODE -eq 0) {
    Write-Host "`nAll tests passed! ✅" -ForegroundColor Green
} else {
    Write-Host "`nSome tests failed! ❌" -ForegroundColor Red
    Write-Host "Check test-results/html-report/index.html for details" -ForegroundColor Yellow
    
    # Open HTML report
    if (Test-Path "test-results/html-report/index.html") {
        Start-Process "test-results/html-report/index.html"
    }
}

# Show screenshots if any
$screenshots = Get-ChildItem -Path "test-results/screenshots" -Filter "*.png" -ErrorAction SilentlyContinue
if ($screenshots) {
    Write-Host "`nScreenshots captured:" -ForegroundColor Yellow
    $screenshots | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Gray }
}