[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.md) · [Français](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.fr.md) · [Español](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.es.md) · **Português** · [Deutsch](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.de.md)

# @analyticstrend/web

Análise de produto para sites. Sem cookies, sem impressão digital, sem dados pessoais.

```bash
npm install @analyticstrend/web
```

```js
import { init } from "@analyticstrend/web";

const analytics = init({ writeKey: "wk_your_key_here" });

analytics.track("page_view");
```

O `init` envia o que sobrou de uma visita anterior e esvazia a fila de novo quando a pessoa sai da
página.

**Aplicativos de página única precisam de mais uma linha.** O `init` roda uma vez por carregamento
de documento, então a navegação no lado do cliente não dispara nada e as suas visualizações de
página contam só os primeiros carregamentos. Rastreie você mesmo as mudanças de rota.

## O que é capturado

A partir da 0.2.0, o SDK acrescenta algumas propriedades próprias, para que as origens de tráfego e
o fluxo entre páginas funcionem sem você precisar ligar nada:

| Propriedade | De onde vem |
| --- | --- |
| `$referrer` | o nome de host do site de referência, quando não é o seu próprio site |
| `$utm_source`, `$utm_medium`, `$utm_campaign`, `$utm_content`, `$utm_term` | a URL de chegada |
| `$ref` | o parâmetro `ref` ou `source` |
| `$click_id` | o *nome* de um parâmetro `gclid`, `msclkid` ou `fbclid`, nunca o valor |
| `$path` | o caminho atual |
| `$from_path` | o caminho anterior, nas visualizações de página |
| `$engaged_ms` | quanto tempo a página ficou visível, só em `page_engagement` (a partir da 0.6.0) |

Só esses nomes de parâmetros são lidos. O resto da query string nunca é olhado, o que importa
porque query strings costumam levar endereços de e-mail e tokens de uso único.

A partir da 0.6.0, ele também envia um evento `page_engagement` quando a página é ocultada ou
fechada, e quando um aplicativo de página única muda para outro caminho, informando quanto tempo a
página ficou visível: nunca menos de um segundo, no máximo 30 minutos em um evento. É a partir
disso que a duração da visita e a taxa de rejeição são calculadas. É um novo tipo de coleta,
ativado por padrão, então confira se o seu texto de privacidade cobre quanto tempo as páginas são
vistas. `init({ engagement: false })`, ou `data-engagement="false"` na tag script, desativa só
isso.

Para desativar tudo:

```js
const analytics = init({ writeKey: "wk_your_key_here", autoCapture: false });
```

Documentação completa: <https://analyticstrend.com/docs/pt/>
