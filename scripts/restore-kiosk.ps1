# restore-kiosk.ps1
# Remove as restrições de kiosk. Execute como Administrador ao encerrar o dia
# ou para permitir acesso normal à máquina.
#
# Uso: powershell -ExecutionPolicy Bypass -File restore-kiosk.ps1

param([switch]$Quiet)

function Write-Status($msg) { if (-not $Quiet) { Write-Host $msg } }

$hklmSys = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
$hkcuSys = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Policies\System"

foreach ($path in @($hklmSys, $hkcuSys)) {
    if (Test-Path $path) {
        Remove-ItemProperty -Path $path -Name "DisableTaskMgr" -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $path -Name "DisableLockWorkstation" -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $path -Name "HideFastUserSwitching" -ErrorAction SilentlyContinue
        Write-Status "[OK] Restrições removidas de $path"
    }
}

Write-Status ""
Write-Status "Restrições de kiosk removidas. Task Manager voltará a funcionar normalmente."
