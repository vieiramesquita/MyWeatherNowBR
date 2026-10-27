# ⛅ MyWeatherNow

[![Live Demo](https://img.shields.io/badge/Demo-GitHub%20Pages-38bdf8?style=for-the-badge&logo=github&logoColor=white)](https://vieiramesquita.github.io/MyWeatherNowBR/)
[![Deploy Status](https://img.shields.io/github/actions/workflow/status/vieiramesquita/MyWeatherNowBR/deploy.yml?branch=main&style=for-the-badge&label=GitHub%20Pages)](https://github.com/vieiramesquita/MyWeatherNowBR/actions)

> 🌐 **Acesse a aplicação online diretamente pelo navegador (Desktop & Mobile):**  
> 👉 **[https://vieiramesquita.github.io/MyWeatherNowBR/](https://vieiramesquita.github.io/MyWeatherNowBR/)**

---

Dashboard meteorológico profissional de alta precisão que integra dados de superfície em tempo real da rede de estações automáticas do **INMET**, previsões numéricas dinâmicas da **Open-Meteo**, estúdio de animação temporal do satélite geoestacionário **GOES-19 (ABI Full Disk)** e um hub analítico completo com gráficos interativos e tabela horária detalhada.

Projetado com arquitetura híbrida: funciona perfeitamente hospedado de forma estática no **GitHub Pages** (com chamadas diretas e CORS habilitado à NOAA STAR) e também em ambiente completo com backend **FastAPI (Python)**.

---

## 📱 100% Otimizado para Mobile e Desktop

- **Interface Responsiva:** Adaptada dinamicamente para smartphones (iOS e Android), tablets e monitores widescreen.
- **Grade Dupla em Telas Pequenas:** 8 cartões meteorológicos organizados em 2 colunas no celular para leitura rápida sem rolagem excessiva.
- **Trilhos Deslizáveis por Toque (*Touch Carousels*):** Navegação horizontal fluida nos atalhos rápidos de capitais, na previsão horária de 24 horas e nos filtros analíticos.
- **Tabela com Colunas Fixas (*Sticky*):** No celular, as colunas de Data e Hora permanecem fixadas à esquerda enquanto você desliza horizontalmente pelas 15 variáveis medidas.

---

## 🚀 Principais Recursos

### 1. 📊 Hub Analítico das Últimas 24h & Gráficos Interativos (Chart.js)
- **Precipitação Horária (Barras):** Volume de chuva em milímetros (mm) hora a hora com indicador de acumulado total do período.
- **Variação Térmica (Linhas com Pontos):** Curvas suaves com marcadores de Temperatura do Ar (°C) e Ponto de Orvalho (°C).
- **Rosa dos Ventos & Intensidade (Área Polar + Linha):** Gráfico polar agrupando as frequências e velocidades nos 16 quadrantes cardeais, acompanhado de curva de velocidade média e rajada máxima.
- **Radiação Solar Global & Umidade Relativa:** Escala dupla com radiação solar convertida fisicamente em $kJ/m^2$ e curva percentual de umidade.
- **Filtros por Categoria:** Alternância instantânea entre *Todos*, *Chuva*, *Temperatura*, *Ventos* e *Radiação*.

### 2. 📋 Tabela Histórica Detalhada com Pontos Cardeais
- Exibição de todas as medições oficiais das últimas 24 horas.
- **Coluna de Direção e Ponto Cardeal:** Exibe tanto o ângulo exato em graus (°), quanto a respectiva sigla na rosa dos ventos em uma badge destacada (`N`, `NNE`, `NE`, `ENE`, `E`, `ESE`, `SE`, `SSE`, `S`, `SSW`, `SW`, `WSW`, `W`, `WNW`, `NW`, `NNW`).
- **Exportação CSV:** Download dos dados completos com codificação UTF-8 BOM pronta para o Microsoft Excel e softwares estatísticos.

### 3. 📍 Estações Meteorológicas INMET em Tempo Real
- **Cobertura Nacional:** Acesso a todas as 672 estações meteorológicas automáticas do INMET em todo o território brasileiro.
- **Atalhos Rápidos:** Seleção instantânea de cidades (Edéia, Goiânia, Rio Verde, Brasília, São Paulo, Rio de Janeiro, Porto Alegre, etc.), atualizando sincronicamente a estação, os gráficos, a previsão e o satélite.
- **Geolocalização (GPS):** Detecção automática da estação mais próxima das coordenadas do usuário via fórmula de Haversine.
- **Tratamento Fidedigno de Fuso Horário:** Conversão rigorosa de UTC para Horário de Brasília (BRT, UTC-3).

### 4. ☀️ Previsão Numérica Open-Meteo
- **Trilho Horário Ancorado na Hora Atual:** A previsão horária inicia exatamente no horário corrente com o marcador `AGORA`.
- **Previsão Sinótica de 7 Dias:** Temperaturas máximas e mínimas com barras termométricas coloridas e probabilidade de precipitação.
- **Alinhamento de Radiação Solar:** Conversão física da irradiância instantânea ($W/m^2$) para energia horária acumulada ($kJ/m^2$), compatibilizando os modelos numéricos com os sensores do INMET ($1\text{ W/m}^2 \times 3600\text{ s} = 3{,}6\text{ kJ/m}^2$).
- **Efemérides Solares:** Horários exatos de nascer e pôr do sol com arco de elevação solar.

### 5. 🛰️ Estúdio de Satélite GOES-19 (ABI Full Disk)
- **Imagens Operacionais NOAA STAR / NESDIS em Tempo Real:** Conexão direta aos feeds de alta frequência do GOES-19 Full Disk a cada 10 minutos.
- **Canais e Composições:** **GeoColor (Cores Naturais)**, **Canal 13 (Infravermelho Limpo 10,35µm)**, **Canal 08 (Vapor d'Água 6,19µm)** e **Sandwich RGB Convectivo**.
- **Projeção Geostacionária Rigorosa:** Cálculo trigonométrico exato da curvatura da Terra (elipsoide WGS84) para posicionar o pin/crosshair da estação meteorológica selecionada com precisão submétrica sobre a imagem do disco hemisférico.
- **Player Temporal Interativo:** Slider de linha do tempo, reprodução contínua em loop, controle de velocidade (0.5x, 1x, 2x, 4x), zoom óptico na estação e resoluções degradáveis (Baixa 339x339, Média 678x678, Alta 1808x1808, Ultra 5424x5424).

---

## 🛠️ Como Executar Localmente

### Pré-requisitos
- Python 3.10+
- Git

### Instalação e Execução
```bash
# Clone o repositório
git clone https://github.com/vieiramesquita/MyWeatherNowBR.git
cd MyWeatherNowBR

# Crie e ative o ambiente virtual
python -m venv .venv
.\.venv\Scripts\activate   # No Windows (PowerShell)
source .venv/bin/activate  # No Linux / macOS

# Instale as dependências
pip install -r requirements.txt

# Inicie a aplicação
python start_server.py
```

Abra o seu navegador em:
```
http://localhost:8000
```

---

## 🌐 Deploy no GitHub Pages

O projeto conta com uma esteira de entrega contínua via **GitHub Actions** configurada em [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

Sempre que um novo commit é enviado para o branch `main`, a compilação e a publicação são executadas automaticamente:
1. URL de Produção: **[https://vieiramesquita.github.io/MyWeatherNowBR/](https://vieiramesquita.github.io/MyWeatherNowBR/)**
2. Para habilitar em forks: acesse **Settings > Pages > Build and deployment**, e selecione **GitHub Actions** como fonte.

---

## 📄 Licença e Apoio
Este projeto foi desenvolvido para fins científicos, operacionais e acadêmicos.