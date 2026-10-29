---
name: project-memory-monitor
description: >-
  Monitors conversations to extract key technical findings, architectural decisions,
  user preferences, and project rules into the persistent PROJECT_MEMORY.md file in
  the repository root. Use this skill whenever the user establishes a rule or preference,
  corrects behavior, approves an architectural change, resolves a non-trivial bug, asks
  to save/sync/review project memory, or when the lifecycle monitor hook reports unsynced
  conversation turns.
---

# Project Memory Monitor (`PROJECT_MEMORY.md`)

Esta skill monitora continuamente a evolução do projeto nas conversas e consolida aprendizados duráveis em [`PROJECT_MEMORY.md`](../../../PROJECT_MEMORY.md) na raiz do repositório, garantindo memória institucional persistente entre sessões e deploys.

## Fluxo de Execução

### 1. Inspecionar Turnos Não Sincronizados da Conversa

Execute o extrator de transcrição para ler apenas os turnos novos (`USER_INPUT`, respostas finais e commits) desde o último checkpoint salvo:

```powershell
.\.venv\Scripts\python.exe .agents/skills/project-memory-monitor/scripts/sync_memory.py inspect --since-last
```

- Caso queira inspecionar um arquivo `transcript.jsonl` específico ou limitar a janela:
  ```powershell
  .\.venv\Scripts\python.exe .agents/skills/project-memory-monitor/scripts/sync_memory.py inspect --transcript "<caminho_transcript.jsonl>" --limit 25
  ```

### 2. Classificar e Filtrar Aprendizados Duráveis

Consulte [references/classification-rubric.md](./references/classification-rubric.md) quando tiver dúvida sobre a categorização. Extraia **apenas** informações de alto sinal nas 4 categorias de [`PROJECT_MEMORY.md`](../../../PROJECT_MEMORY.md):

| Categoria (`--category`) | Quando registrar |
| :--- | :--- |
| `rule` | Regras inegociáveis do usuário, padrões visuais/UX, restrições de ambiente, invariantes de código ou autoria. |
| `decision` | Decisões arquiteturais (ADR), escolhas de biblioteca/protocolo, refatorações estruturais e *trade-offs*. |
| `keypoint` | Descobertas técnicas críticas, causas-raiz de bugs complexos, limites de APIs externas (INMET, NOAA, IBGE, Open-Meteo). |
| `milestone` | Marcos relevantes concluídos e validados na conversa (ex.: novas features ou correções publicadas em `main`). |

> **Não registre** ruído transitório (tentativas intermediárias descartadas, logs temporários, segredos/tokens ou instruções genéricas de programação).

### 3. Persistir Entradas de Forma Idempotente

Use `sync_memory.py add` para inserir ou atualizar entradas sem duplicação (deduplicadas automaticamente por `--id`):

```powershell
.\.venv\Scripts\python.exe .agents/skills/project-memory-monitor/scripts/sync_memory.py add `
  --category decision `
  --id "goes19-hidpi-canvas" `
  --title "Renderização Geoestacionária GOES-19 em Canvas High-DPI" `
  --summary "Substituído zoom CSS scale(18+) por recorte direto em <canvas> High-DPI com sub-crop 5424x5424 (2 km ABI) e malhas IBGE 1px em espaço de tela." `
  --files "index.html,static/index.html,static/app.js,static/styles.css"
```

Para múltiplas entradas de uma só vez, você também pode passar um lote JSON via `stdin` com `sync_memory.py batch` (veja `--help`).

### 4. Marcar Checkpoint e Validar Integridade

Ao concluir o registro dos pontos da conversa atual, atualize o checkpoint de monitoramento e valide a estrutura do Markdown:

```powershell
.\.venv\Scripts\python.exe .agents/skills/project-memory-monitor/scripts/sync_memory.py mark-synced
.\.venv\Scripts\python.exe .agents/skills/project-memory-monitor/scripts/sync_memory.py validate
```

Confirme que `validate` retorna código de saída `0` antes de encerrar ou commitar [`PROJECT_MEMORY.md`](../../../PROJECT_MEMORY.md).
