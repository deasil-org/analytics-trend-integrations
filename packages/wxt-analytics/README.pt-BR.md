[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/wxt-analytics/README.md) · [Français](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/wxt-analytics/README.fr.md) · [Español](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/wxt-analytics/README.es.md) · **Português** · [Deutsch](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/wxt-analytics/README.de.md)

# @analyticstrend/wxt-analytics

O AnalyticsTrend como provedor para o módulo de análise do [WXT](https://wxt.dev). Os eventos
passam pelo SDK de extensões do AnalyticsTrend, então sobrevivem a um segundo plano suspenso,
respeitam o consentimento de coleta de dados do Firefox e o Global Privacy Control, e podem
registrar desinstalações. A própria chave liga/desliga do WXT controla tudo isso.

```bash
npm install @analyticstrend/wxt-analytics @analyticstrend/extension @wxt-dev/analytics@0.5.4
```

Use `@wxt-dev/analytics` 0.5.4 com npm: as versões 0.5.5 e 0.5.6 publicam um script `postinstall`
de desenvolvimento que falha no npm. O pnpm, que pula os scripts de instalação das dependências,
funciona com qualquer uma delas.

```ts
// wxt.config.ts
export default defineConfig({ modules: ["@wxt-dev/analytics/module"] });

// app.config.ts
import { analyticsTrend } from "@analyticstrend/wxt-analytics";

export default defineAppConfig({
  analytics: {
    enabled: storage.defineItem("local:analytics-enabled", { fallback: true }),
    providers: [
      analyticsTrend({ writeKey: import.meta.env.WXT_ANALYTICSTREND_WRITE_KEY, uninstallTracking: true }),
    ],
  },
});
```

## O que chega ao AnalyticsTrend

| O WXT entrega ao provedor | O que acontece |
| --- | --- |
| `track`: o nome do evento e as propriedades | Enviados como o evento e as propriedades dele |
| Um clique rastreado automaticamente: tag, id, classe | Enviados |
| Um clique rastreado automaticamente: texto e link | Descartados. Em um site, são o conteúdo daquele site e um endereço completo |
| `page(url)` | `page_viewed`, com `path` só para as páginas da própria extensão |
| `identify` | Ignorado. O SDK mantém o próprio identificador aleatório |
| Idioma, tela, referenciador, endereço, título, sessão | Nunca enviados |

Guia completo: <https://analyticstrend.com/docs/pt/guide/install-wxt>
