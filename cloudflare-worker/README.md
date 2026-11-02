# 🛰️ Proxy Serverless de Tiles Nativos GOES-19 (Cloudflare Worker)

Este microserviço gratuito resolve definitivamente o gargalo de banda do GOES:
- **Resolução Nativa Real:** Permite ao aplicativo carregar os tiles de satélite do CPTEC/INPE em **nível nativo de 2 km (zoom 5)**.
- **Ultraleve:** Cada tile tem apenas **~25 KB** (em vez de baixar o Full Disk de 10 MB da NOAA).
- **Ultrarrápido:** A Cloudflare armazena em cache nos servidores de borda de São Paulo, Rio de Janeiro, Brasília e Fortaleza por 10 minutos (tempo de resposta < 30ms).
- **100% Gratuito:** O plano gratuito da Cloudflare inclui 100.000 requisições diárias sem custo.

---

## 🚀 Como Implantar em 2 Minutos

### Método 1: Pelo Painel Web da Cloudflare (Sem instalar nada)
1. Acesse [dash.cloudflare.com](https://dash.cloudflare.com/) e crie uma conta gratuita (se ainda não tiver).
2. No menu lateral esquerdo, clique em **Workers & Pages** -> **Create application** -> **Create Worker**.
3. Dê um nome (ex: `myweathernow-tiles`) e clique em **Deploy**.
4. Clique em **Edit code** e substitua todo o código pelo conteúdo de [`worker.js`](worker.js).
5. Clique em **Deploy** no canto superior direito.
6. Copie a URL gerada (ex: `https://myweathernow-tiles.seu-subdominio.workers.dev`).

### Método 2: Pelo Terminal via Wrangler
```bash
cd cloudflare-worker
npx wrangler login
npx wrangler deploy
```

---

## ⚙️ Como Ativar no Aplicativo

Basta colar a URL do seu Worker no `static/app.js` na constante `DEFAULT_CPTEC_TILE_PROXY`:
```javascript
const DEFAULT_CPTEC_TILE_PROXY = "https://myweathernow-tiles.seu-subdominio.workers.dev";
```
Ou passar via parâmetro de URL no navegador:
`https://vieiramesquita.github.io/MyWeatherNowBR/?tile_proxy=https://myweathernow-tiles.seu-subdominio.workers.dev`

