[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/wxt-analytics/README.md) · **Français** · [Español](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/wxt-analytics/README.es.md) · [Português](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/wxt-analytics/README.pt-BR.md) · [Deutsch](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/wxt-analytics/README.de.md)

# @analyticstrend/wxt-analytics

AnalyticsTrend comme fournisseur pour le module d’analytique de [WXT](https://wxt.dev). Les
événements passent par le SDK d’extension d’AnalyticsTrend : ils survivent à un arrière-plan
suspendu, respectent le consentement à la collecte de données de Firefox et Global Privacy
Control, et peuvent enregistrer les désinstallations. L’interrupteur de WXT lui-même commande le
tout.

```bash
npm install @analyticstrend/wxt-analytics @analyticstrend/extension @wxt-dev/analytics@0.5.4
```

Utilisez `@wxt-dev/analytics` 0.5.4 avec npm : les versions 0.5.5 et 0.5.6 publient un script
`postinstall` de développement qui échoue sous npm. pnpm, qui ignore les scripts d’installation
des dépendances, fonctionne avec chacune d’elles.

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

## Ce qui parvient à AnalyticsTrend

| WXT transmet au fournisseur | Ce qui se passe |
| --- | --- |
| `track` : le nom de l’événement et ses propriétés | Envoyés comme l’événement et ses propriétés |
| Un clic suivi automatiquement : balise, id, classe | Envoyés |
| Un clic suivi automatiquement : texte et lien | Écartés. Sur un site web, ce sont le contenu de ce site et une adresse complète |
| `page(url)` | `page_viewed`, avec `path` uniquement pour les pages propres à l’extension |
| `identify` | Ignoré. Le SDK garde son propre identifiant aléatoire |
| Langue, écran, référent, adresse, titre, session | Jamais envoyés |

Guide complet : <https://analyticstrend.com/docs/fr/guide/install-wxt>
