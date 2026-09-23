$proc = Start-Process -FilePath "desktop\bin\Debug\RafiqPOS.exe" -PassThru
Start-Sleep -Seconds 3
$p = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
if ($p) {
    Write-Output "SUCCESS: RafiqPOS.exe started successfully and is running!"
    Stop-Process -Id $proc.Id -Force
} else {
    Write-Output "Process exited with code: $($proc.ExitCode)"
}

$dbExists = Test-Path "desktop\bin\Debug\data\rafiq_pos.db"
Write-Output "Database created: $dbExists"
