[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/sdk-core/README.md) · [Français](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/sdk-core/README.fr.md) · **Español** · [Português](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/sdk-core/README.pt-BR.md) · [Deutsch](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/sdk-core/README.de.md)

# @analyticstrend/sdk-core

La cola, el envío por lotes y los reintentos que comparten los SDK de navegador de AnalyticsTrend,
independientes de la plataforma para que los dos adaptadores ligeros no puedan divergir.

Se encarga de lo que es fácil hacer mal sin notarlo: guardar antes de enviar, registrar el progreso
de cada lote para que un cierre nunca vuelva a enviar lo que ya salió, serializar las operaciones
de la cola para que las llamadas simultáneas no puedan perder eventos y, sin conexión, espaciar los
reintentos en lugar de reintentar una vez por evento.

Normalmente no lo instalas directamente: llega con
[`@analyticstrend/extension`](https://www.npmjs.com/package/@analyticstrend/extension) o
[`@analyticstrend/web`](https://www.npmjs.com/package/@analyticstrend/web).

Documentación completa: <https://analyticstrend.com/docs/es/>
