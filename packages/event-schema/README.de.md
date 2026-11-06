[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/event-schema/README.md) · [Français](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/event-schema/README.fr.md) · [Español](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/event-schema/README.es.md) · [Português](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/event-schema/README.pt-BR.md) · **Deutsch**

# @analyticstrend/event-schema

Der Schnittstellenvertrag zwischen den SDKs von AnalyticsTrend und seinem Collector: die
Ereignistypen, die Limits und die Validierung, die beide Seiten teilen.

Bewusst ohne Abhängigkeiten, weil das Paket in den Browsererweiterungen der Kunden mitgeliefert
wird, wo jede transitive Abhängigkeit ein Risiko ist.

Normalerweise installieren Sie es nicht direkt – es kommt mit
[`@analyticstrend/extension`](https://www.npmjs.com/package/@analyticstrend/extension) oder
[`@analyticstrend/web`](https://www.npmjs.com/package/@analyticstrend/web).

Vollständige Dokumentation: <https://analyticstrend.com/docs/de/>
