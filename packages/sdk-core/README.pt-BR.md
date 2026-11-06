[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/sdk-core/README.md) · [Français](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/sdk-core/README.fr.md) · [Español](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/sdk-core/README.es.md) · **Português** · [Deutsch](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/sdk-core/README.de.md)

# @analyticstrend/sdk-core

A fila, o envio em lotes e as novas tentativas que os SDKs de navegador do AnalyticsTrend
compartilham, independentes de plataforma para que os dois adaptadores enxutos não possam
divergir.

Cuida das partes que é fácil errar sem perceber: gravar antes de enviar, registrar o progresso de
cada lote para que um encerramento nunca reenvie o que já saiu, serializar as operações da fila
para que chamadas simultâneas não possam perder eventos e, sem conexão, espaçar as tentativas em
vez de tentar de novo uma vez por evento.

Normalmente você não instala este pacote diretamente: ele vem com
[`@analyticstrend/extension`](https://www.npmjs.com/package/@analyticstrend/extension) ou
[`@analyticstrend/web`](https://www.npmjs.com/package/@analyticstrend/web).

Documentação completa: <https://analyticstrend.com/docs/pt/>
