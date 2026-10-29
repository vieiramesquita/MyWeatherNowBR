# Rubrica de Classificação da Memória do Projeto (`PROJECT_MEMORY.md`)

Use esta rubrica para decidir **o que extrair** da conversa e **em qual seção salvar**.

## 1. Regras de Projeto & Diretrizes Inegociáveis (`rule`)
Registre aqui qualquer instrução explícita ou implícita do usuário que deva governar todas as tarefas futuras.
- **Sinais típicos na conversa:** *"sempre"*, *"nunca"*, *"priorize"*, *"não remova"*, *"mantenha paridade"*, correções diretas do usuário sobre UI, idioma, autoria ou fluxo de deploy.
- **Formato recomendado:** Imperativo, direto e verificável (ex.: *"Manter paridade byte a byte entre `index.html` e `static/index.html` verificada com `fc.exe` antes de cada commit"*).

## 2. Decisões Arquiteturais & Técnicas (`decision`)
Registre escolhas estruturais tomadas para resolver requisitos de engenharia, performance ou compatibilidade.
- **Sinais típicos:** Substituição de arquitetura, escolha de formato/API, estratégia de cache/memória, compatibilidade dupla (servidor local FastAPI vs. estático GitHub Pages).
- **Formato recomendado:** Contexto breve + decisão adotada + impacto mensurável + arquivos afetados.

## 3. Pontos-Chave, Diagnósticos & Comportamento de APIs (`keypoint`)
Registre fatos empíricos descobertos durante depurações e testes que economizam horas de investigação futura.
- **Sinais típicos:** Limites de CORS, endpoints descontinuados, formatos de compressão/projeção cartográfica, armadilhas de navegador/GPU/OS, peculiaridades de execução local (ex.: `.venv`, line endings CRLF/LF).
- **Formato recomendado:** Sintoma/contexto + causa-raiz exata + solução técnica aplicada.

## 4. Marcos Cronológicos (`milestone`)
Registre entregas consolidadas (commits relevantes, versões lançadas ou grandes ciclos de atualização).
- **Formato recomendado:** Uma linha objetiva com data, escopo e hash do commit quando disponível.

## O que NUNCA salvar em `PROJECT_MEMORY.md`
1. Credenciais, chaves de API, tokens ou dados sensíveis de ambiente.
2. Caminhos temporários de scratch (`brain/<id>/scratch/...`) como dependências permanentes do projeto.
3. Tentativas intermediárias que falharam sem deixar aprendizado técnico reutilizável.
