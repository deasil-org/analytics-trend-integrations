[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/extension/README.md) · [Français](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/extension/README.fr.md) · **Español** · [Português](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/extension/README.pt-BR.md) · [Deutsch](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/extension/README.de.md)

# @analyticstrend/extension

Analítica de producto para extensiones de Chromium y Firefox. Sin código remoto, así que supera
Manifest V3 y la política de revisión de Mozilla.

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

La `version` del manifiesto va con cada lote como versión de la aplicación, para el informe
Versiones; pasa `appVersion` para enviar otra.

Los eventos se escriben en el almacenamiento de la extensión antes de cualquier envío, así que un
service worker suspendido a mitad de envío no pierde nada y nunca envía dos veces.

**Nota sobre Firefox.** Chrome recuerda una URL de desinstalación entre reinicios; Firefox la
olvida cuando se descarga su página de eventos. Pasar `uninstallTracking: true` la vuelve a
registrar en cada inicio. Registrarla, en cambio, desde un manejador de `onInstalled` funciona para
siempre en Chrome, pero en Firefox deja de funcionar en menos de un minuto.

Documentación completa: <https://analyticstrend.com/docs/es/>
