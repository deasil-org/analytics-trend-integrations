[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/sdk-core/README.md) · **Français** · [Español](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/sdk-core/README.es.md) · [Português](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/sdk-core/README.pt-BR.md) · [Deutsch](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/sdk-core/README.de.md)

# @analyticstrend/sdk-core

La mise en file d’attente, le regroupement en lots et les nouvelles tentatives que partagent les
SDK navigateur d’AnalyticsTrend, indépendants de toute plateforme pour que les deux adaptateurs
légers ne puissent pas diverger.

Il prend en charge ce qu’il est facile de rater subtilement : enregistrer avant d’envoyer, noter
la progression lot par lot pour qu’un arrêt ne renvoie jamais ce qui est déjà parti, sérialiser les
opérations sur la file pour que des appels simultanés ne puissent pas perdre d’événements et, hors
ligne, espacer les tentatives plutôt que de réessayer une fois par événement.

Vous n’avez normalement pas à l’installer vous-même : il arrive avec
[`@analyticstrend/extension`](https://www.npmjs.com/package/@analyticstrend/extension) ou
[`@analyticstrend/web`](https://www.npmjs.com/package/@analyticstrend/web).

Documentation complète : <https://analyticstrend.com/docs/fr/>
