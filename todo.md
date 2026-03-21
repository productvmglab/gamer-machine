# TODO

## Segurança do Kiosk

### Bloquear Ctrl+Alt+Del (Task Manager)
O Electron não consegue bloquear Ctrl+Alt+Del nativamente — o Windows intercepta no kernel antes do app.

**Solução planejada:**
- Script PowerShell `scripts/setup-kiosk.ps1` que grava no Registry:
  ```
  HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System
    DisableTaskMgr = 1 (REG_DWORD)
  ```
- Script de restore `scripts/restore-kiosk.ps1` para uso pelo admin ao encerrar o dia
- Alternativa: chamar via `child_process.execSync` no `main.ts` em produção ao iniciar o app

**Impacto:** Sem isso, usuário pode abrir Task Manager via Ctrl+Alt+Del e encerrar o processo.
