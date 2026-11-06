[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/wxt-analytics/README.md) · [Français](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/wxt-analytics/README.fr.md) · [Español](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/wxt-analytics/README.es.md) · [Português](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/wxt-analytics/README.pt-BR.md) · **Deutsch**

# @analyticstrend/wxt-analytics

AnalyticsTrend als Provider für das Analytics-Modul von [WXT](https://wxt.dev). Ereignisse laufen
über das Erweiterungs-SDK von AnalyticsTrend, überstehen daher einen angehaltenen Hintergrund,
beachten die Einwilligung zur Datenerhebung in Firefox und Global Privacy Control und können
Deinstallationen erfassen. Der eigene Ein/Aus-Schalter von WXT steuert all das.

```bash
npm install @analyticstrend/wxt-analytics @analyticstrend/extension @wxt-dev/analytics@0.5.4
```

Verwenden Sie `@wxt-dev/analytics` 0.5.4 mit npm: 0.5.5 und 0.5.6 veröffentlichen ein
`postinstall`-Skript für die Entwicklung, das unter npm fehlschlägt. pnpm, das die
Installationsskripte von Abhängigkeiten überspringt, funktioniert mit jeder davon.

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

## Was bei AnalyticsTrend ankommt

| WXT übergibt dem Provider | Was passiert |
| --- | --- |
| `track`: Ereignisname und Eigenschaften | Als Ereignis und seine Eigenschaften gesendet |
| Ein automatisch erfasster Klick: Tag, ID, Klasse | Gesendet |
| Ein automatisch erfasster Klick: Text und Link | Verworfen. Auf einer Website sind das deren Inhalte und eine vollständige Adresse |
| `page(url)` | `page_viewed`, mit `path` nur für die eigenen Seiten der Erweiterung |
| `identify` | Ignoriert. Das SDK behält seine eigene zufällige Kennung |
| Sprache, Bildschirm, Referrer, Adresse, Titel, Sitzung | Nie gesendet |

Vollständige Anleitung: <https://analyticstrend.com/docs/de/guide/install-wxt>
