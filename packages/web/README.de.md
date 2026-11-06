[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.md) · [Français](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.fr.md) · [Español](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.es.md) · [Português](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.pt-BR.md) · **Deutsch**

# @analyticstrend/web

Produktanalyse für Websites. Keine Cookies, kein Fingerprinting, keine personenbezogenen Daten.

```bash
npm install @analyticstrend/web
```

```js
import { init } from "@analyticstrend/web";

const analytics = init({ writeKey: "wk_your_key_here" });

analytics.track("page_view");
```

`init` sendet, was von einem früheren Besuch übrig ist, und leert die Warteschlange erneut, wenn
die Seite verlassen wird.

**Single-Page-Apps brauchen eine Zeile mehr.** `init` läuft einmal pro Laden eines Dokuments,
daher löst clientseitige Navigation nichts aus, und Ihre Seitenaufrufe zählen nur das erste Laden.
Erfassen Sie Routenwechsel selbst.

## Was erfasst wird

Ab 0.2.0 fügt das SDK einige eigene Eigenschaften hinzu, damit Traffic-Quellen und der Weg durch
die Seiten funktionieren, ohne dass Sie etwas verdrahten müssen:

| Eigenschaft | Woher sie kommt |
| --- | --- |
| `$referrer` | der Hostname der verweisenden Website, wenn es nicht Ihre eigene ist |
| `$utm_source`, `$utm_medium`, `$utm_campaign`, `$utm_content`, `$utm_term` | die Einstiegs-URL |
| `$ref` | der Parameter `ref` oder `source` |
| `$click_id` | der *Name* eines Parameters `gclid`, `msclkid` oder `fbclid`, nie sein Wert |
| `$path` | der aktuelle Pfad |
| `$from_path` | der vorherige Pfad, bei Seitenaufrufen |
| `$engaged_ms` | wie lange die Seite sichtbar war, nur bei `page_engagement` (ab 0.6.0) |

Nur diese Parameternamen werden gelesen. Der Rest des Query-Strings wird nie angesehen. Das ist
wichtig, weil Query-Strings regelmäßig E-Mail-Adressen und Einmal-Tokens enthalten.

Ab 0.6.0 sendet es außerdem ein `page_engagement`-Ereignis, wenn die Seite ausgeblendet oder
geschlossen wird und wenn eine Single-Page-App zu einem anderen Pfad wechselt, mit der Angabe, wie
lange die Seite sichtbar war: nie unter einer Sekunde, höchstens 30 Minuten in einem Ereignis.
Daraus werden Besuchsdauer und Absprungrate berechnet. Das ist eine neue Art der Erfassung, die
standardmäßig aktiv ist; prüfen Sie also, ob Ihre Datenschutzhinweise abdecken, wie lange Seiten
angesehen werden. `init({ engagement: false })` oder `data-engagement="false"` am Script-Tag
schaltet nur das ab.

So schalten Sie alles ab:

```js
const analytics = init({ writeKey: "wk_your_key_here", autoCapture: false });
```

Vollständige Dokumentation: <https://analyticstrend.com/docs/de/>
