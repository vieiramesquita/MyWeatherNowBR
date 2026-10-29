# ⛅ MyWeatherNow • Argon Pro v4.1

[![Live Demo](https://img.shields.io/badge/Demo-GitHub%20Pages-38bdf8?style=for-the-badge&logo=github&logoColor=white)](https://vieiramesquita.github.io/MyWeatherNowBR/)
[![Deploy Status](https://img.shields.io/github/actions/workflow/status/vieiramesquita/MyWeatherNowBR/deploy.yml?branch=main&style=for-the-badge&label=GitHub%20Pages)](https://github.com/vieiramesquita/MyWeatherNowBR/actions)

> 🌐 **Acesse a aplicação online diretamente pelo navegador (Desktop & Mobile):**  
> 👉 **[https://vieiramesquita.github.io/MyWeatherNowBR/](https://vieiramesquita.github.io/MyWeatherNowBR/)**

---

Dashboard meteorológico, agrometeorológico e de sensoriamento remoto orbital em tempo real que **prioriza os dados medidos em solo pelas 672 estações meteorológicas automáticas do INMET**, complementados por modelos numéricos e atmosféricos da **Open-Meteo & CAMS**, malhas cartográficas do **IBGE** e o estúdio temporal geoestacionário do satélite **GOES-19 (ABI Full Disk / NOAA STAR)**.

Projetado com **arquitetura híbrida 100% funcional no GitHub Pages** (consulta direta CORS à telemetria oficial das estações INMET via geocódigo IBGE, gráficos de 24h, busca nacional com status operacional ao vivo e exportação de GIF/PNG/CSV) e também compatível com execução local via **FastAPI (Python)**.

---

## 🚀 Principais Recursos (Edição Argon Pro v4.1)

### 0. 📡 Prioridade Absoluta às Estações Meteorológicas Físicas (INMET Solo)
- **Telemetria Oficial Direta no Navegador:** Todas as **672 estações INMET** estão geocodificadas com código municipal oficial do IBGE (`7 dígitos`), permitindo consulta direta e em tempo real aos sensores físicos do INMET (`apiprevmet3.inmet.gov.br` + `apitempo.inmet.gov.br`) diretamente no GitHub Pages, além de histórico físico local de 24h.
- **Hierarquia Sensor Solo > Modelo Numérico:** Os cartões de superfície, gráficos/tabela de 24h, microclima agrometeorológico (`VPD`, janela de pulverização) e alertas priorizam sempre os sensores físicos da estação meteorológica; o modelo numérico (`Open-Meteo`) atua apenas como previsão futura, complemento de ar superior (`CAPE`, `UV`, `AQI`) ou contingência transparente caso uma estação esteja em manutenção (`Pane`), oferecendo atalho de 1 clique para a estação física operante mais próxima.

### 1. ⚡ Inteligência Atmosférica, Qualidade do Ar, Agrometeorologia & Arco Solar
- **Convecção & Perfil Vertical de Nuvens:** Monitoramento em tempo real da energia convectiva disponível (**CAPE** em `J/kg`), visibilidade horizontal (`km`) e cobertura nebulosa estratificada em **3 níveis atmosféricos** (Altas `>6 km`, Médias `2–6 km` e Baixas `<2 km`).
- **Qualidade do Ar (CAMS) & Radiação UV (OMS):** Índices **US AQI** e **EU AQI** ao vivo, concentrações de material particulado fino (**PM2.5** e **PM10**), **Ozônio (`O₃`)**, **Poeira/Aerossóis** e **Índice UV** com recomendações dinâmicas de fotoproteção da OMS.
- **Painel Agrometeorológico (FAO-56):** Evapotranspiração de referência diária e horária (**`ET₀`** em `mm`), **Déficit de Pressão de Vapor (`VPD`** em `kPa`) e **Janela Operacional de Pulverização Agrícola** (avaliação automática de deriva e evaporação por vento, umidade relativa, temperatura e precipitação).
- **Arco Solar Interativo SVG & Fase Lunar:** Trajetória solar calculada minuto a minuto no Horário de Brasília (`BRT`), duração exata do fotoperíodo, contagem regressiva para o próximo nascer/pôr do sol e fase lunar astronômica iluminada (%).
- **Banner Inteligente de Alertas:** Avisos automáticos para tempestades severas, rajadas intensas, baixa umidade crítica (critérios Defesa Civil/INMET), calor extremo e degradação da qualidade do ar.

### 2. 🛰️ Estúdio Satélite GOES-19 (Full Disk) com Vetores Geoestacionários & GIF no Navegador
- **10 Canais e Composições Multiespectrais NOAA STAR:**
  - *Realce Convectivo IR (Canal 13 • 10,35µm)*, *Sandwich Convectivo*, *GeoColor (True-Color / Luzes Noturnas)*, *🔥 Focos de Queimada (Fire Temperature RGB)*, *🌀 Massas de Ar & Frentes Frias RGB*, *Vapor d'Água (Canal 08 • 6,19µm)*, *Convecção Diurna RGB*, *Microfísica Dia/Noite RGB*, *Terra, Nuvem & Fogo (DayLandCloudFire RGB)* e *Infravermelho Canal 14 (11,2µm)*.
- **Motor Vetorial Geoestacionário SVG (`WGS84` -> `GOES-East -75°W`):** Sobreposição vetorial nítida em qualquer nível de zoom (`vector-effect: non-scaling-stroke`) das **27 UFs do Brasil**, **malha municipal dinâmica do IBGE** para o estado da estação selecionada e **manchas urbanizadas IBGE 2022**.
- **Exportação 100% Client-Side (`.gif` & `.png` HD):** Codificador **GIF89a + LZW + Bayer Dithering** nativo em JavaScript puro que gera e baixa animações `.gif` e capturas `.png` (`960x960`) com camadas vetoriais, pin da estação e carimbo `BRT/UTC` direto no navegador.
- **Player Avançado & Tela Cheia:** Marcadores clicáveis por horário na linha do tempo, pan/zoom fluido por mouse ou pinça *multitouch*, controle de velocidade (`0.5x` a `4x`) e modo **Tela Cheia** (botão `⛶` ou tecla `F`).

### 3. 📊 Hub Analítico das Últimas 24h (Todas as 672 Estações do Brasil)
- **5 Painéis Gráficos Interativos (Chart.js):**
  1. *Precipitação Horária Acumulada (`mm`)*
  2. *Variação Térmica, Sensação & Ponto de Orvalho (`°C`)*
  3. *Rosa dos Ventos Polar (16 rumos cardeais) + Velocidade & Rajadas (`m/s`)*
  4. *Radiação Solar Global (`kJ/m²`) & Umidade Relativa (`%`)*
  5. *Pressão Atmosférica Local (`hPa`, com tendência barométrica de 3h) & Déficit de Vapor `VPD` (`kPa`)*
- **Tabela Histórica de 15 Colunas & Exportação CSV:** Série horária completa em `BRT` e `UTC` com exportação `UTF-8 BOM` pronta para Excel, Python e R em qualquer estação do país.

### 4. ⭐ Busca Nacional Instantânea, Favoritos & Links Compartilháveis
- **672 Estações INMET:** Busca instantânea tolerante a acentos por município, código (`A029`, `A002`, `A101`, etc.) ou sigla da UF, além de localização automática da estação mais próxima via **GPS (Haversine)**.
- **Estações Favoritas (`⭐`):** Salve suas estações preferidas na barra superior com persistência local no navegador.
- **Deep-Linking (`?station=CODIGO`):** Compartilhe o link direto para qualquer estação meteorológica brasileira com um clique.

---

## 🛠️ Como Executar Localmente (Opcional)

```bash
# Clone o repositório
git clone https://github.com/vieiramesquita/MyWeatherNowBR.git
cd MyWeatherNowBR

# Crie e ative o ambiente virtual
python -m venv .venv
.\.venv\Scripts\activate   # Windows (PowerShell)
source .venv/bin/activate  # Linux / macOS

# Instale as dependências e inicie o servidor FastAPI
pip install -r requirements.txt
python start_server.py
```

Acesse em `http://localhost:8000`.

---

## 👨‍💻 Autoria & Desenvolvimento

Aplicação concebida e desenvolvida de forma independente por **Vinicius Vieira Mesquita** em colaboração de *pair programming* com o **Google Antigravity AI**.

- 📧 **Contato:** [vieirammesquita@gmail.com](mailto:vieirammesquita@gmail.com)
- 💻 **Repositório:** [github.com/vieiramesquita/MyWeatherNowBR](https://github.com/vieiramesquita/MyWeatherNowBR)
