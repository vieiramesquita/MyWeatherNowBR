# Diretrizes de Agente & Memória Viva (`MyWeatherNow`)

1. **Memória Persistente Obrigatória:** Consulte sempre [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md) antes de alterações arquiteturais ou de interface para respeitar todas as regras consolidadas do projeto.
2. **Monitoramento Contínuo de Conversa:** Sempre que surgirem novas regras do usuário, decisões arquiteturais importantes, correções de comportamento ou diagnósticos técnicos relevantes durante a conversa, ative a skill [`project-memory-monitor`](./.agents/skills/project-memory-monitor/SKILL.md) e persista-os em [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md).
