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
chargement de document : seul, il ne compte donc que les premiers chargements, et la navigation
côté client ne déclenche rien. Passez `pageViews: "history"` pour envoyer une page vue tout de
suite, puis une autre à chaque changement de chemin, navigation dans l’application et boutons
précédent et suivant compris :

```js
const analytics = init({ writeKey: "wk_your_key_here", pageViews: "history" });
```

Seul le chemin compte : une nouvelle chaîne de requête ou un nouveau fragment, à eux seuls,
désignent la même page. Si votre application envoie déjà son propre `page_view` à chaque
changement de route, une page vue pour la page tout juste comptée n’est pas envoyée de nouveau :
activer cette option ne compte donc pas une page deux fois. La balise script compte les pages vues
de cette façon par défaut.

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

## La balise script, sans attributs

Depuis la 0.8.0, la balise script (`dist/script.js`) lit aussi ses options dans
`window.analyticstrendConfig`, pour une installation qui ne peut pas mettre d’attributs sur la
balise, comme Google Tag Manager. Les clés sont les attributs de la balise en camelCase, avec les
mêmes valeurs en texte, et un attribut posé sur la balise l’emporte sur la même clé ici.

```html
<script>
  window.analyticstrendConfig = { writeKey: "wk_your_key_here", outboundLinks: "true" };
  window.analyticstrendQueue = window.analyticstrendQueue || [];
  window.analyticstrendQueue.push(["signup", { plan: "pro" }]);
</script>
```

Les événements ajoutés à `window.analyticstrendQueue` avant le chargement du script sont envoyés
dès qu’il démarre, et un ajout après cela est envoyé aussitôt. Une deuxième copie du script avec la
même clé d’écriture ne démarre rien : une page qui porte la balise deux fois n’est pas comptée deux
fois.

## Navigateurs automatisés

Un navigateur piloté par un outil d’automatisation, comme Puppeteer, Playwright ou Selenium,
n’envoie rien et ne stocke rien : `navigator.webdriver` y vaut true, et un tel navigateur est
bien plus souvent un robot d’exploration qu’une personne. L’indicateur est lu dans le navigateur
et n’est jamais envoyé. Si vos propres tests de bout en bout vérifient les événements que votre
site envoie, comptez-les quand même :

```js
const analytics = init({ writeKey: "wk_your_key_here", countAutomatedBrowsers: true });
```

Sur la balise script, c’est `data-count-automated="true"`.

Documentation complète : <https://analyticstrend.com/docs/fr/>
