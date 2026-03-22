# TODO

## Segurança do Kiosk

### Bloquear Task Manager ✅ Implementado

**Abordagem:** Registry `DisableTaskMgr` + UAC automático no primeiro start.

**Arquivos:**
- `scripts/setup-kiosk.ps1` — define `DisableTaskMgr=1` em HKLM (admin) e HKCU
- `scripts/restore-kiosk.ps1` — remove as restrições (rodar como admin ao encerrar manutenção)
- `apps/machine-guard/electron/main.ts` — chama o setup ao iniciar em produção

**Fluxo automático no `pnpm kiosk`:**
1. App verifica se `DisableTaskMgr` já está definido no registry
2. Se não: tenta definir via HKCU sem elevação
3. Se HKCU falhar: pede elevação via UAC (`Start-Process -Verb RunAs`) — aparece **uma única vez**
4. Após aprovação do UAC: HKLM fica definido permanentemente (restarts não requerem nova aprovação)
5. Ao fechar: tenta restaurar HKCU (best-effort); HKLM precisa de `restore-kiosk.ps1` manual

**Por que requer admin:**
- `Ctrl+Alt+Del` é a Secure Attention Sequence (SAS) do Windows — interceptada no kernel
- Nenhuma aplicação user-mode pode bloqueá-la diretamente
- `DisableTaskMgr` impede que o Gerenciador de Tarefas seja aberto após o usuário pressionar Ctrl+Alt+Del
- Matar `Taskmgr.exe` via código também requer admin (processo protegido pelo Windows)
- Portanto, a única abordagem efetiva é o registry com privilégio elevado

**Setup manual (alternativa):**
```
# Rodar UMA VEZ como Administrador na máquina kiosk:
powershell -ExecutionPolicy Bypass -File scripts\setup-kiosk.ps1

# Ao encerrar o dia / manutenção:
powershell -ExecutionPolicy Bypass -File scripts\restore-kiosk.ps1
```
