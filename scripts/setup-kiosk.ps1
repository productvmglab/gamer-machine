# setup-kiosk.ps1
# Configura o Windows para modo kiosk: desabilita Task Manager.
#
# Quando executado como Administrador: define HKLM (efeito permanente, todos os usuários).
# Quando executado como usuário comum:  define HKCU (efeito para o usuário atual).
#
# O app Gamer Machine chama este script automaticamente ao iniciar em modo produção.
# Se necessário, execute manualmente como Administrador:
#   powershell -ExecutionPolicy Bypass -File scripts\setup-kiosk.ps1

param([switch]$Quiet)

function Write-Status($msg) { if (-not $Quiet) { Write-Host $msg } }

$appliedAny = $false

# 1. HKLM — requer Administrador; bloqueia para todos os usuários da máquina
$hklmSys = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
try {
    if (-not (Test-Path $hklmSys)) {
        New-Item -Path $hklmSys -Force -ErrorAction Stop | Out-Null
    }
    Set-ItemProperty -Path $hklmSys -Name "DisableTaskMgr" -Value 1 -Type DWord -ErrorAction Stop
    Set-ItemProperty -Path $hklmSys -Name "DisableLockWorkstation" -Value 1 -Type DWord -ErrorAction Stop
    Set-ItemProperty -Path $hklmSys -Name "HideFastUserSwitching" -Value 1 -Type DWord -ErrorAction Stop
    Write-Status "[OK] HKLM: DisableTaskMgr, DisableLockWorkstation, HideFastUserSwitching = 1"
    $appliedAny = $true
} catch {
    Write-Status "[AVISO] HKLM inacessivel (requer Admin): $($_.Exception.Message)"
}

# 2. HKCU — sem necessidade de Admin; bloqueia para o usuário atual
$hkcuSys = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Policies\System"
try {
    if (-not (Test-Path $hkcuSys)) {
        New-Item -Path $hkcuSys -Force -ErrorAction Stop | Out-Null
    }
    Set-ItemProperty -Path $hkcuSys -Name "DisableTaskMgr" -Value 1 -Type DWord -ErrorAction Stop
    Write-Status "[OK] HKCU: DisableTaskMgr = 1"
    $appliedAny = $true
} catch {
    Write-Status "[AVISO] HKCU inacessivel: $($_.Exception.Message)"
}

if (-not $appliedAny) {
    Write-Status "[ERRO] Nenhuma chave foi definida. Execute como Administrador para garantir o bloqueio."
    exit 1
}

Write-Status ""
Write-Status "Configuracao de kiosk aplicada com sucesso."
