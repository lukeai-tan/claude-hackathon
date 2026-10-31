$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
python -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Dependency install failed' }
python -m unittest discover -s tests -v
if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
$buildArgs = @('--noconfirm', '--clean', '--onefile', '--windowed', '--name', 'OpenPDF-Studio', '--collect-all', 'pymupdf', '--collect-all', 'pdf2docx', '--collect-submodules', 'fontTools.ttLib.tables', '--add-data', 'LICENSE;.', '--add-data', 'THIRD_PARTY.md;.')
$ocrPath = 'C:\Program Files\Tesseract-OCR'
if (Test-Path "$ocrPath\tesseract.exe") {
    $buildArgs += @('--add-data', "$ocrPath;tesseract")
} else {
    Write-Warning 'Tesseract not installed: this EXE will require tesseract on PATH for OCR.'
}
python -m PyInstaller @buildArgs app.py
if ($LASTEXITCODE -ne 0) { throw 'Executable build failed' }
$process = Start-Process -FilePath 'dist\OpenPDF-Studio.exe' -ArgumentList '--self-test' -Wait -PassThru
if ($process.ExitCode -ne 0) { throw 'Executable smoke test failed' }
Write-Host 'Built dist\OpenPDF-Studio.exe'
