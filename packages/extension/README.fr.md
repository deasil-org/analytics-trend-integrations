[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/extension/README.md) · **Français** · [Español](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/extension/README.es.md) · [Português](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/extension/README.pt-BR.md) · [Deutsch](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/extension/README.de.md)

# @analyticstrend/extension

Analyse produit pour les extensions Chromium et Firefox. Aucun code distant : le paquet passe
sans difficulté Manifest V3 et la politique d’examen de Mozilla.

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

La `version` du manifeste accompagne chaque lot comme version de l’application, pour le rapport
Versions ; passez `appVersion` pour en envoyer une autre.

Les événements sont écrits dans le stockage de l’extension avant tout envoi : un service worker
suspendu en plein envoi ne perd rien et n’envoie jamais rien deux fois.

**À noter pour Firefox.** Chrome se souvient d’une URL de désinstallation d’un redémarrage à
l’autre ; Firefox l’oublie quand sa page d’événements se décharge. Passer
`uninstallTracking: true` l’enregistre de nouveau à chaque démarrage. Un enregistrement fait
plutôt dans un gestionnaire `onInstalled` fonctionne donc indéfiniment sur Chrome, mais cesse de
fonctionner sur Firefox en moins d’une minute.

Documentation complète : <https://analyticstrend.com/docs/fr/>
