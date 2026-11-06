[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/extension/README.md) · [Français](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/extension/README.fr.md) · [Español](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/extension/README.es.md) · [Português](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/extension/README.pt-BR.md) · **Deutsch**

# @analyticstrend/extension

Produktanalyse für Chromium- und Firefox-Erweiterungen. Kein Remote-Code, daher besteht das Paket
Manifest V3 und die Prüfrichtlinien von Mozilla.

```bash
npm install @analyticstrend/extension
```

```js
// background.js — at the top level, so it runs on every background start. Not awaited:
// Chrome will not run a service worker that uses top-level await.
import { initBackground } from "@analyticstrend/extension";

const analytics = initBackground({
  writeKey: "wk_your_key_here",
  uninstallTracking: true,
});

analytics.track("popup_opened");
```

Die `version` des Manifests geht mit jedem Stapel als App-Version mit, für den Bericht
„Versionen“; übergeben Sie `appVersion`, um eine andere zu senden.

Ereignisse werden vor jedem Senden in den Erweiterungsspeicher geschrieben, sodass ein mitten im
Senden angehaltener Service Worker nichts verliert und nie doppelt sendet.

**Hinweis zu Firefox.** Chrome merkt sich eine Deinstallations-URL über Neustarts hinweg; Firefox
vergisst sie, wenn seine Ereignisseite entladen wird. `uninstallTracking: true` registriert sie
bei jedem Start neu. Eine Registrierung stattdessen in einem `onInstalled`-Handler funktioniert in
Chrome deshalb dauerhaft, hört in Firefox aber innerhalb einer Minute auf zu funktionieren.

Vollständige Dokumentation: <https://analyticstrend.com/docs/de/>
