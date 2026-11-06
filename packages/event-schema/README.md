**English** · [Français](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/event-schema/README.fr.md) · [Español](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/event-schema/README.es.md) · [Português](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/event-schema/README.pt-BR.md) · [Deutsch](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/event-schema/README.de.md)

# @analyticstrend/event-schema

The wire contract between AnalyticsTrend's SDKs and its collector: event types, the limits,
and the validation both sides share.

Deliberately dependency-free, because it ships inside customers' browser extensions where
every transitive dependency is a liability.

You do not normally install this directly — it arrives with
[`@analyticstrend/extension`](https://www.npmjs.com/package/@analyticstrend/extension) or
[`@analyticstrend/web`](https://www.npmjs.com/package/@analyticstrend/web).

Full documentation: <https://analyticstrend.com/docs>
