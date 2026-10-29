# Memória Persistente do Projeto — MyWeatherNow

> Documento vivo mantido automaticamente pela skill [`project-memory-monitor`](.agents/skills/project-memory-monitor/SKILL.md). Consolida regras inegociáveis, decisões arquiteturais, descobertas técnicas e marcos das conversas.

- **Última sincronização:** `2026-10-29 07:48 BRT`
- **Resumo de registros:** `5` regras • `4` decisões • `4` pontos-chave • `5` marcos

---

## 1. Regras de Projeto & Diretrizes Inegociáveis

<!-- SECTION:RULES:START -->
<!-- ENTRY:prioridade-estacoes-inmet:START -->
- **Prioridade Absoluta aos Dados Físicos das Estações INMET** (`#prioridade-estacoes-inmet`)
  - Sempre priorizar as medições físicas das 672 estações meteorológicas automáticas do INMET (via API local, API oficial CORS `apiprevmet3.inmet.gov.br`, cache estático ou `localStorage`) sobre modelos de grade numérica. Usar Open-Meteo apenas como contingência quando não houver telemetria física disponível, indicando estação operante vizinha.
  - **Arquivos relacionados:** [`static/app.js`](static/app.js), [`app/inmet_service.py`](app/inmet_service.py), [`inmet_stations.json`](inmet_stations.json), [`static/data/inmet_stations.json`](static/data/inmet_stations.json)
<!-- ENTRY:prioridade-estacoes-inmet:END -->
<!-- ENTRY:paridade-index-html:START -->
- **Paridade Byte a Byte entre `index.html` e `static/index.html`** (`#paridade-index-html`)
  - Qualquer alteração estrutural em `index.html` deve ser espelhada identicamente em `static/index.html` (para servir tanto no GitHub Pages estático quanto no backend FastAPI local) e verificada com `fc.exe index.html static\index.html` antes do commit, incrementando a query `?v=X.Y.Z` de cache-busting.
  - **Arquivos relacionados:** [`index.html`](index.html), [`static/index.html`](static/index.html)
<!-- ENTRY:paridade-index-html:END -->
<!-- ENTRY:compatibilidade-estatica-github-pages:START -->
- **Autonomia 100% Client-Side no GitHub Pages (`github.io`)** (`#compatibilidade-estatica-github-pages`)
  - Nenhuma funcionalidade essencial (busca das 672 estações, geolocalização GPS Haversine, telemetria INMET, previsão 7 dias, inteligência atmosférica, estúdio GOES-19 em todas as escalas e exportação PNG/GIF) pode depender exclusivamente do backend Python FastAPI.
  - **Arquivos relacionados:** [`static/app.js`](static/app.js), [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
<!-- ENTRY:compatibilidade-estatica-github-pages:END -->
<!-- ENTRY:autoria-independente-creditos:START -->
- **Preservar Bloco de Autoria Independente & Contatos** (`#autoria-independente-creditos`)
  - Manter sempre o card oficial de Autoria & Desenvolvimento creditando exclusivamente **Vinicius Vieira Mesquita** (`vieirammesquita@gmail.com`, `github.com/vieiramesquita`) e **Google Antigravity AI** (pair programming), sem menções a financiamentos institucionais externos.
  - **Arquivos relacionados:** [`index.html`](index.html), [`static/index.html`](static/index.html), [`README.md`](README.md)
<!-- ENTRY:autoria-independente-creditos:END -->
<!-- ENTRY:idioma-fluxo-git-ambiente:START -->
- **Idioma Português (`pt-BR`), Ambiente `.venv` e Execução Direta de Deploy** (`#idioma-fluxo-git-ambiente`)
  - Responder sempre em Português (`pt-BR`), executar Python via `.\.venv\Scripts\python.exe` (evitando o alias da Microsoft Store no Windows), usar Playwright com `channel="msedge"`, preservar quebras CRLF em `static/styles.css` e efetuar `git commit` + `git push origin main` quando concluir entregas para atualizar o GitHub Pages.
  - **Arquivos relacionados:** [`static/styles.css`](static/styles.css), [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
<!-- ENTRY:idioma-fluxo-git-ambiente:END -->
<!-- SECTION:RULES:END -->

---

## 2. Decisões Arquiteturais & Técnicas (ADR)

<!-- SECTION:DECISIONS:START -->
<!-- ENTRY:adr-catalogo-672-estacoes-client-side:START -->
### Catálogo Estático Enriquecido das 672 Estações INMET com Geocode IBGE (`2026-10-28` • `#adr-catalogo-672-estacoes-client-side`)
- Carregamento direto de `static/data/inmet_stations.json` no navegador com busca normalizada sem acentos, cálculo Haversine local para GPS e enriquecimento de todas as 672 estações com `geocode` municipal IBGE de 7 dígitos e status operacional.
  - **Arquivos relacionados:** [`inmet_stations.json`](inmet_stations.json), [`static/data/inmet_stations.json`](static/data/inmet_stations.json), [`static/app.js`](static/app.js)
<!-- ENTRY:adr-catalogo-672-estacoes-client-side:END -->

<!-- ENTRY:adr-argon-pro-v4-intel-gif89a:START -->
### Arquitetura Argon Pro v4.0 (Intel Atmosférica, AQI, FAO-56 e Codificador GIF89a Nativo) (`2026-10-28` • `#adr-argon-pro-v4-intel-gif89a`)
- Expansão do dashboard com CAPE, perfil vertical de nuvens em 3 camadas, qualidade do ar CAMS (US/EU AQI, PM2.5, PM10, O3, poeira), evapotranspiração Penman-Monteith FAO-56 (`ET0`), VPD, efemérides solares/lunares e codificador LZW GIF89a puro em JavaScript para exportação animada no navegador.
  - **Arquivos relacionados:** [`index.html`](index.html), [`static/app.js`](static/app.js), [`static/styles.css`](static/styles.css), [`app/openmeteo_service.py`](app/openmeteo_service.py)
<!-- ENTRY:adr-argon-pro-v4-intel-gif89a:END -->

<!-- ENTRY:adr-goes19-canvas-hidpi-2km-abi:START -->
### Motor Geoestacionário High-DPI em `<canvas>` para GOES-19 Hiper Local 3x (`2026-10-29` • `#adr-goes19-canvas-hidpi-2km-abi`)
- Substituído o zoom via CSS `transform: scale(18+)` por renderização direta em `<canvas id="goesViewportCanvas">` com recorte da janela física geoestacionária (~35 km em Hiper Local 3x), sub-crop em memória `38% x 38%` de imagens `5424x5424` (2 km ABI, reduzindo RAM de ~118 MB para ~16 MB/quadro), malhas municipais IBGE `qualidade=intermediaria` 1px em espaço de tela e mira `#satelliteCrosshair` nativa 1x.
  - **Arquivos relacionados:** [`index.html`](index.html), [`static/index.html`](static/index.html), [`static/app.js`](static/app.js), [`static/styles.css`](static/styles.css)
<!-- ENTRY:adr-goes19-canvas-hidpi-2km-abi:END -->

<!-- ENTRY:adr-skill-project-memory-monitor:START -->
### Skill e Lifecycle Hooks `project-memory-monitor` para Memória Institucional (`2026-10-29` • `#adr-skill-project-memory-monitor`)
- Implementada a skill `.agents/skills/project-memory-monitor` acompanhada de `sync_memory.py` e `.agents/hooks.json` (`SessionStart`, `PreInvocation`, `Stop`) para monitorar transcrições JSONL da conversa e persistir regras, decisões e pontos-chave de forma idempotente em `PROJECT_MEMORY.md`.
  - **Arquivos relacionados:** [`.agents/skills/project-memory-monitor/SKILL.md`](.agents/skills/project-memory-monitor/SKILL.md), [`.agents/skills/project-memory-monitor/scripts/sync_memory.py`](.agents/skills/project-memory-monitor/scripts/sync_memory.py), [`.agents/hooks.json`](.agents/hooks.json), [`AGENTS.md`](AGENTS.md), [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md)
<!-- ENTRY:adr-skill-project-memory-monitor:END -->
<!-- SECTION:DECISIONS:END -->

---

## 3. Pontos-Chave, Diagnósticos & Comportamento de APIs

<!-- SECTION:KEYPOINTS:START -->
<!-- ENTRY:kp-openmeteo-date-formatted-fallback:START -->
### Formatação `date_formatted` no Fallback Direto do Open-Meteo (`2026-10-28` • `#kp-openmeteo-date-formatted-fallback`)
- No modo estático (`fetchDirectOpenMeteo`), os cartões da previsão de 7 dias exigem geração explícita do campo `date_formatted` (`DD/MM`) no cliente para paridade com o payload do `app/openmeteo_service.py`.
  - **Arquivos relacionados:** [`static/app.js`](static/app.js), [`app/openmeteo_service.py`](app/openmeteo_service.py)
<!-- ENTRY:kp-openmeteo-date-formatted-fallback:END -->

<!-- ENTRY:kp-noaa-cdn-cors-dust-bandwidth:START -->
### Particularidades do CDN NOAA STAR (`GOES19/ABI/FD/`) (`2026-10-29` • `#kp-noaa-cdn-cors-dust-bandwidth`)
- O endpoint `cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/` possui `CORS: *` e projeção fixa geoestacionária compatível com `latlonToGeosPct` (`339x339` a `10848x10848`), enquanto `s1.cptec.inpe.br` não envia cabeçalho CORS. A pasta `FD/DayLandCloudFire/` foi descontinuada pela NOAA (substituída por `FD/Dust/` 24h). A listagem HTML da pasta tem ~1,5 MB (cacheada por 3 min em `_noaaDirCache`) e cada JPEG `5424x5424` tem ~10 MB (~380 KB/s por stream TCP).
  - **Arquivos relacionados:** [`static/app.js`](static/app.js)
<!-- ENTRY:kp-noaa-cdn-cors-dust-bandwidth:END -->

<!-- ENTRY:kp-htmlimageelement-empty-src-pitfall:START -->
### Armadilha `img.src = ""` em `HTMLImageElement` e Cancelamento Seguro (`2026-10-29` • `#kp-htmlimageelement-empty-src-pitfall`)
- Definir `img.src = ""` dentro de `onload` sem antes limpar `img.onerror = null` faz o navegador resolver `""` para `index.html`, disparando `onerror` e baixando novamente quadros de 10 MB. Para abortar downloads obsoletos sem tráfego HTTP extra, limpar `onload`/`onerror` primeiro e atribuir `im.src = "data:,"`.
  - **Arquivos relacionados:** [`static/app.js`](static/app.js)
<!-- ENTRY:kp-htmlimageelement-empty-src-pitfall:END -->

<!-- ENTRY:kp-ibge-malhas-v3-intermediaria-df-go:START -->
### API de Malhas v3 do IBGE (`qualidade=intermediaria`) e Entorno do DF (`2026-10-29` • `#kp-ibge-malhas-v3-intermediaria-df-go`)
- Para zooms locais/hiper-locais (`delta <= 2.5`), a API `servicodados.ibge.gov.br/api/v3/malhas/estados/{UF}?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=intermediaria` evita vértices simplificados em excesso, combinada à API v1 de localidades para nomes municipais. Quando `UF === "DF"`, mesclar automaticamente `DF + GO` para exibir os municípios goianos limítrofes.
  - **Arquivos relacionados:** [`static/app.js`](static/app.js)
<!-- ENTRY:kp-ibge-malhas-v3-intermediaria-df-go:END -->
<!-- SECTION:KEYPOINTS:END -->

---

## 4. Registro Cronológico de Marcos da Conversa

<!-- SECTION:MILESTONES:START -->
<!-- ENTRY:ms-fix-7d-dates-96e3457:START -->
- **`[2026-10-28]` Correção de datas na previsão de 7 dias no GitHub Pages (`96e3457`)** — Adicionado `date_formatted` (`DD/MM`) no cliente Open-Meteo estático.
<!-- ENTRY:ms-fix-7d-dates-96e3457:END -->
<!-- ENTRY:ms-autoria-search-estatica:START -->
- **`[2026-10-28]` Seção de Autoria Independente & Busca Estática de 672 Estações** — Substituído bloco de financiamento pelos créditos e contatos reais e ativada busca/GPS client-side de todas as 672 estações INMET.
<!-- ENTRY:ms-autoria-search-estatica:END -->
<!-- ENTRY:ms-argon-pro-v4-cc2406c:START -->
- **`[2026-10-28]` Lançamento Argon Pro `v4.0.0` (`cc2406c`)** — Painéis de inteligência atmosférica, CAMS AQI, agrometeo FAO-56, vetores IBGE e exportador GIF89a no navegador.
<!-- ENTRY:ms-argon-pro-v4-cc2406c:END -->
<!-- ENTRY:ms-inmet-priority-v410-6174248:START -->
- **`[2026-10-29]` Priorização Estrita de Estações Físicas INMET `v4.1.0` (`6174248`)** — Integração direta com API oficial CORS do INMET, cache local de 24h e sugestão automática de estação ativa mais próxima.
<!-- ENTRY:ms-inmet-priority-v410-6174248:END -->
<!-- ENTRY:ms-goes19-hiperlocal-v411-4e27412:START -->
- **`[2026-10-29]` Motor GOES-19 High-DPI Canvas & 2 km ABI para Hiper Local 3x `v4.1.1` (`4e27412`)** — Corrigido Hiper Local 3x no GitHub Pages com recorte geoestacionário em `<canvas>`, malhas IBGE intermediárias 1px, rótulos de cidades vizinhas e canal NOAA Dust RGB 24h.
<!-- ENTRY:ms-goes19-hiperlocal-v411-4e27412:END -->
<!-- SECTION:MILESTONES:END -->
