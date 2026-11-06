[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/extension/README.md) · [Français](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/extension/README.fr.md) · [Español](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/extension/README.es.md) · **Português** · [Deutsch](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/extension/README.de.md)

# @analyticstrend/extension

Análise de produto para extensões do Chromium e do Firefox. Sem código remoto, então passa pelo
Manifest V3 e pela política de revisão da Mozilla.

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

A `version` do manifesto vai com cada lote como a versão do aplicativo, para o relatório Versões;
passe `appVersion` para enviar outra.

Os eventos são gravados no armazenamento da extensão antes de qualquer envio, então um service
worker suspenso no meio do envio não perde nada e nunca envia duas vezes.

**Observação sobre o Firefox.** O Chrome lembra uma URL de desinstalação entre reinícios; o
Firefox a esquece quando a página de eventos dele é descarregada. Passar `uninstallTracking: true`
registra a URL de novo a cada início. Registrá-la, em vez disso, em um handler de `onInstalled`
funciona para sempre no Chrome, mas para de funcionar no Firefox em menos de um minuto.

Documentação completa: <https://analyticstrend.com/docs/pt/>
