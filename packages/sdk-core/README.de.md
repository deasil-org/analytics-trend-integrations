[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/sdk-core/README.md) · [Français](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/sdk-core/README.fr.md) · [Español](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/sdk-core/README.es.md) · [Português](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/sdk-core/README.pt-BR.md) · **Deutsch**

# @analyticstrend/sdk-core

Das Einreihen in die Warteschlange, das Bündeln in Stapel und die Wiederholungsversuche, die die
Browser-SDKs von AnalyticsTrend gemeinsam nutzen, plattformunabhängig gehalten, damit die beiden
schlanken Adapter nicht auseinanderdriften können.

Es übernimmt die Teile, bei denen sich leicht subtile Fehler einschleichen: vor dem Senden
speichern, den Fortschritt pro Stapel festhalten, damit ein Beenden nie erneut sendet, was schon
unterwegs war, Operationen auf der Warteschlange serialisieren, damit gleichzeitige Aufrufe keine
Ereignisse verlieren können, und offline mit wachsendem Abstand erneut versuchen statt einmal pro
Ereignis.

Normalerweise installieren Sie es nicht direkt – es kommt mit
[`@analyticstrend/extension`](https://www.npmjs.com/package/@analyticstrend/extension) oder
[`@analyticstrend/web`](https://www.npmjs.com/package/@analyticstrend/web).

Vollständige Dokumentation: <https://analyticstrend.com/docs/de/>
