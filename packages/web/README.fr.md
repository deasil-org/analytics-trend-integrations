[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.md) · **Français** · [Español](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.es.md) · [Português](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.pt-BR.md) · [Deutsch](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.de.md)

# @analyticstrend/web

Analyse produit pour les sites web. Sans cookies, sans empreinte numérique, sans données
personnelles.

```bash
npm install @analyticstrend/web
```

```js
import { init } from "@analyticstrend/web";

const analytics = init({ writeKey: "wk_your_key_here" });

analytics.track("page_view");
```

`init` envoie ce qui restait d’une visite précédente, et vide de nouveau la file au moment où la
page est quittée.

**Les applications monopages ont besoin d’une ligne de plus.** `init` s’exécute une fois par
chargement de document : la navigation côté client ne déclenche donc rien, et vos pages vues ne
comptent que les premiers chargements. Suivez vous-même les changements de route.

## Ce qui est capturé

Depuis 0.2.0, le SDK ajoute de lui-même quelques propriétés, pour que les sources de trafic et
l’enchaînement des pages fonctionnent sans que vous ayez rien à brancher :

| Propriété | D’où elle vient |
| --- | --- |
| `$referrer` | le nom d’hôte du site référent, quand ce n’est pas votre propre site |
| `$utm_source`, `$utm_medium`, `$utm_campaign`, `$utm_content`, `$utm_term` | l’URL d’arrivée |
| `$ref` | le paramètre `ref` ou `source` |
| `$click_id` | le *nom* d’un paramètre `gclid`, `msclkid` ou `fbclid`, jamais sa valeur |
| `$path` | le chemin actuel |
| `$from_path` | le chemin précédent, sur les pages vues |
| `$engaged_ms` | la durée pendant laquelle la page a été visible, sur `page_engagement` seulement (depuis 0.6.0) |

Seuls ces noms de paramètres sont lus. Le reste de la chaîne de requête n’est jamais regardé, ce
qui compte, car les chaînes de requête transportent couramment des adresses e-mail et des jetons à
usage unique.

Depuis 0.6.0, il envoie aussi un événement `page_engagement` quand la page est masquée ou fermée,
et quand une application monopage passe à un autre chemin, pour indiquer combien de temps la page
a été visible : jamais moins d’une seconde, au plus 30 minutes par événement. C’est à partir de
cela que sont calculés la durée de visite et le taux de rebond. C’est un nouveau type de collecte,
activé par défaut : vérifiez donc que votre texte de confidentialité couvre la durée de
consultation des pages. `init({ engagement: false })`, ou `data-engagement="false"` sur la balise
script, le désactive, et lui seul.

Pour tout désactiver :

```js
const analytics = init({ writeKey: "wk_your_key_here", autoCapture: false });
```

Documentation complète : <https://analyticstrend.com/docs/fr/>
