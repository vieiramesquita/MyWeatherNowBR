/**
 * MyWeatherNow - Cloudflare Worker CORS Proxy para Tiles Nativos do GOES-19 (CPTEC/INPE)
 * 
 * Permite que o GitHub Pages acesse os tiles do satélite GOES em resolução nativa de 2 km (zoom 5)
 * sem precisar baixar o Full Disk de 10 MB. Cada tile tem apenas ~25 KB.
 * 
 * Implantação Gratuita no Cloudflare Workers:
 * 1. Crie uma conta gratuita em https://workers.cloudflare.com/
 * 2. Crie um Worker e cole este código (ou rode 'npx wrangler deploy').
 */

export default {
  async fetch(request, env, ctx) {
    // Tratar preflight OPTIONS para CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);

    // Rota 1: /tiles/:date/:prod/:time/:z/:tx/:ty.png
    // Exemplo: /tiles/20261102/ch13_cpt_DSA/1440/5/11/17.png
    const tileMatch = url.pathname.match(/^\/tiles\/(\d{8})\/([A-Za-z0-9_]+)\/(\d{4})\/(\d+)\/(\d+)\/(\d+)\.png$/);
    // Rota 2: /borders/:z/:tx/:ty.png
    const borderMatch = url.pathname.match(/^\/borders\/(\d+)\/(\d+)\/(\d+)\.png$/);
    // Rota 3: /json/:prod/lastest.json
    const jsonMatch = url.pathname.match(/^\/json\/([A-Za-z0-9_]+)\/lastest\.json$/);

    let targetUrl = "";
    let isJson = false;
    if (tileMatch) {
      const [, date, prod, time, z, tx, ty] = tileMatch;
      targetUrl = `https://s1.cptec.inpe.br/goes/goes16/web_tiles/${date}/${prod}/${time}/${z}/${tx}/${ty}.png`;
    } else if (borderMatch) {
      const [, z, tx, ty] = borderMatch;
      targetUrl = `https://s1.cptec.inpe.br/goes/goes16/web_tiles/references/countries/${z}/${tx}/${ty}.png`;
    } else if (jsonMatch) {
      const [, prod] = jsonMatch;
      targetUrl = `https://s1.cptec.inpe.br/goes/goes16/web_tiles/json/${prod}/lastest.json`;
      isJson = true;
    } else if (url.searchParams.has("url")) {
      // Rota 4: /?url=https://s1.cptec.inpe.br/...
      const rawUrl = url.searchParams.get("url");
      if (rawUrl.startsWith("https://s1.cptec.inpe.br/")) {
        targetUrl = rawUrl;
        isJson = targetUrl.endsWith(".json");
      } else {
        return new Response("URL não permitida. Apenas s1.cptec.inpe.br é suportado.", { status: 403 });
      }
    } else {
      return new Response(JSON.stringify({
        service: "MyWeatherNow GOES Native Tile Proxy",
        status: "online",
        routes: [
          "/tiles/{date}/{prod}/{time}/{z}/{tx}/{ty}.png",
          "/borders/{z}/{tx}/{ty}.png",
          "/json/{prod}/lastest.json",
          "/?url={s1.cptec.inpe.br/...}"
        ]
      }), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // Cache da Cloudflare: armazena tiles na borda por 10 minutos (600s), JSON por 60s
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    let response = await cache.match(cacheKey);

    if (!response) {
      try {
        const inpeResp = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 MyWeatherNow-Satellite-Worker/1.0",
            "Referer": "https://satelite.cptec.inpe.br/"
          }
        });

        if (!inpeResp.ok) {
          return new Response(`Erro ao buscar do CPTEC: status ${inpeResp.status}`, {
            status: inpeResp.status,
            headers: { "Access-Control-Allow-Origin": "*" }
          });
        }

        const body = await inpeResp.arrayBuffer();
        const contentType = isJson
          ? "application/json; charset=utf-8"
          : (inpeResp.headers.get("content-type") || "image/png");
        const cacheControl = isJson
          ? "public, max-age=60, s-maxage=120"
          : "public, max-age=600, s-maxage=1200";

        response = new Response(body, {
          status: inpeResp.status,
          headers: {
            "Content-Type": contentType,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Cache-Control": cacheControl,
            "X-Proxied-By": "MyWeatherNow-Cloudflare-Worker"
          }
        });

        // Grava no cache da borda da Cloudflare
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      } catch (err) {
        return new Response(`Erro de conexão com CPTEC: ${err.message}`, {
          status: 502,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    return response;
  }
};
