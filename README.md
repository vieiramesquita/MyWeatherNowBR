# ⛅ MyWeatherNow

Dashboard meteorológico profissional integrado à rede de estações automáticas do **INMET**, previsões numéricas em tempo real da **Open-Meteo**, estúdio de animação temporal do satélite **GOES-16 (ABI)** e hub analítico com gráficos interativos.

Disponível tanto para execução local completa (FastAPI + Python) quanto para hospedagem estática direta no **GitHub Pages**.

---

## 🚀 Principais Recursos

### 1. 📊 Hub Analítico das Últimas 24h & Tabela Detalhada
- **Gráficos Interativos (Chart.js)**:
  - **Precipitação Horária**: Volume de chuva em mm com indicador de acumulado total do período.
  - **Variação Térmica**: Curvas de Temperatura do Ar e Ponto de Orvalho (°C) com marcadores.
  - **Rosa dos Ventos & Intensidade**: Gráfico de área polar agrupando frequências nos 16 quadrantes cardeais, acompanhado de gráfico de velocidade média e rajada máxima.
  - **Radiação Solar & Umidade**: Radiação global convertida fisicamente (kJ/m²) e umidade relativa (%).
- **Tabela Histórica com Pontos Cardeais**:
  - Exibição horária completa com Data (BRT/UTC), Hora, Temperaturas, Sensação, Umidade, Pressão, Vento, **Direção em Graus**, **Ponto Cardeal (ex: N, NNE, SE, WNW)**, Rajadas e Chuva.
- **Exportação CSV**: Exportação instantânea dos dados da estação com suporte a UTF-8 BOM para Excel.

### 2. 📍 Estação Meteorológica INMET (Solo em Tempo Real)
- **Atualização Automatizada**: Coleta a cada 60 minutos com contagem regressiva e cache inteligente.
- **Rede Nacional**: Acesso a todas as estações automáticas do INMET em todo o Brasil.
- **Localização Inteligente**: Detecção por geolocalização (fórmula de Haversine) e atalhos rápidos para as principais capitais e regiões.
- **Tratamento de Fuso Horário**: Conversão precisa de UTC para Horário de Brasília (BRT, UTC-3).

### 3. ☀️ Previsão Numérica Open-Meteo
- **Trilho Horário Dinâmico**: Previsão hora a hora ancorada no horário atual real com destaque (`AGORA`).
- **Previsão Semanal**: Tendência para 7 dias com máxima, mínima, probabilidade de chuva e vento.
- **Efemérides Solares**: Nascer e pôr do sol com arco de elevação astronômica.
- **Alinhamento Físico de Radiação**: Conversão rigorosa de irradiância ($W/m^2$) para energia horária ($kJ/m^2$).

### 4. 🛰️ Estúdio de Satélite GOES-16 (ABI)
- Quadros georreferenciados em tempo real com canais DSA, Sanduíche, Vapor d'Água, Infravermelho e GeoColor.
- Camadas vetoriais com divisas estaduais e manchas urbanas do IBGE.
- Player temporal com controle de velocidade, avanço quadro a quadro e exportação em GIF animado.

---

## 🛠️ Como Executar Localmente

### Pré-requisitos
- Python 3.10+
- Git

### Instalação
```bash
# Clone o repositório
git clone https://github.com/vieiramesquita/MeteoApp_Personal.git
cd MeteoApp_Personal

# Crie e ative o ambiente virtual
python -m venv .venv
.\.venv\Scripts\activate   # No Windows (PowerShell)
source .venv/bin/activate  # No Linux/macOS

# Instale as dependências
pip install -r requirements.txt

# Inicie o servidor
python start_server.py
```
Acesse a aplicação no navegador em `http://localhost:8000`.

---

## 🌐 Publicação no GitHub Pages (GitHub.io)

O projeto está 100% configurado para GitHub Pages através do GitHub Actions:
1. Crie o repositório no seu GitHub (ex.: `MeteoApp_Personal`).
2. Adicione o remote e faça o push:
   ```bash
   git remote add origin https://github.com/vieiramesquita/MeteoApp_Personal.git
   git branch -M main
   git push -u origin main
   ```
3. No GitHub, acesse **Settings > Pages**:
   - Em **Build and deployment > Source**, selecione **GitHub Actions**.
   - O workflow `.github/workflows/deploy.yml` será acionado automaticamente e publicará o site em:
     `https://vieiramesquita.github.io/MeteoApp_Personal/`

---

## 📄 Licença
Distribuído sob licença livre para fins científicos e acadêmicos.