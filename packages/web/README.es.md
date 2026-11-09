[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.md) · [Français](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.fr.md) · **Español** · [Português](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.pt-BR.md) · [Deutsch](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.de.md)

# @analyticstrend/web

Analítica de producto para sitios web. Sin cookies, sin huella digital, sin datos personales.

```bash
npm install @analyticstrend/web
```

```js
import { init } from "@analyticstrend/web";

const analytics = init({ writeKey: "wk_your_key_here" });

analytics.track("page_view");
```

`init` envía lo que quedó pendiente de una visita anterior y vuelve a vaciar la cola cuando se
abandona la página.

**Las aplicaciones de una sola página necesitan una línea más.** `init` se ejecuta una vez por
carga de documento, así que, sin más, solo cuenta las primeras cargas y la navegación del lado del
cliente no dispara nada. Pasa `pageViews: "history"` para enviar una vista de página en ese momento
y otra cada vez que cambia la ruta, incluidas la navegación dentro de la aplicación y los botones
de atrás y adelante:

```js
const analytics = init({ writeKey: "wk_your_key_here", pageViews: "history" });
```

Solo cuenta la ruta: una nueva cadena de consulta o un nuevo fragmento, por sí solos, son la misma
página. Si tu aplicación ya envía su propio `page_view` en cada cambio de ruta, una vista de página
de la página recién contada no se vuelve a enviar, así que activarlo no cuenta una página dos
veces. La etiqueta script cuenta las vistas de página así por defecto.

## Qué se captura

Desde la 0.2.0, el SDK añade algunas propiedades propias, para que las fuentes de tráfico y el
flujo entre páginas funcionen sin que tengas que conectar nada:

| Propiedad | De dónde sale |
| --- | --- |
| `$referrer` | el nombre de host del sitio de referencia, cuando no es tu propio sitio |
| `$utm_source`, `$utm_medium`, `$utm_campaign`, `$utm_content`, `$utm_term` | la URL de llegada |
| `$ref` | el parámetro `ref` o `source` |
| `$click_id` | el *nombre* de un parámetro `gclid`, `msclkid` o `fbclid`, nunca su valor |
| `$path` | la ruta actual |
| `$from_path` | la ruta anterior, en las vistas de página |
| `$engaged_ms` | cuánto tiempo estuvo visible la página, solo en `page_engagement` (desde la 0.6.0) |

Solo se leen esos nombres de parámetros. El resto de la cadena de consulta nunca se mira, lo que
importa porque las cadenas de consulta suelen llevar direcciones de correo electrónico y tokens de
un solo uso.

Desde la 0.6.0 también envía un evento `page_engagement` cuando la página se oculta o se cierra, y
cuando una aplicación de una sola página pasa a otra ruta, con cuánto tiempo estuvo visible la
página: nunca menos de un segundo y como mucho 30 minutos en un evento. De ahí salen la duración de
la visita y la tasa de rebote. Es un nuevo tipo de recopilación que viene activado por defecto, así
que comprueba que tu texto de privacidad cubra cuánto tiempo se ven las páginas.
`init({ engagement: false })`, o `data-engagement="false"` en la etiqueta script, lo desactiva solo
a él.

Para desactivarlo todo:

```js
const analytics = init({ writeKey: "wk_your_key_here", autoCapture: false });
```

## La etiqueta script, sin atributos

Desde la 0.8.0, la etiqueta script (`dist/script.js`) también lee sus opciones de
`window.analyticstrendConfig`, para una instalación que no puede poner atributos en la etiqueta,
como Google Tag Manager. Las claves son los atributos de la etiqueta en camelCase, con los mismos
valores de texto, y un atributo en la etiqueta prevalece sobre la misma clave aquí.

```html
<script>
  window.analyticstrendConfig = { writeKey: "wk_your_key_here", outboundLinks: "true" };
  window.analyticstrendQueue = window.analyticstrendQueue || [];
  window.analyticstrendQueue.push(["signup", { plan: "pro" }]);
</script>
```

Los eventos que se añaden a `window.analyticstrendQueue` antes de que cargue el script se envían
en cuanto arranca, y uno que se añade después se envía al momento. Una segunda copia del script con
la misma clave de escritura no arranca nada, así que una página con la etiqueta dos veces no se
cuenta dos veces.

Documentación completa: <https://analyticstrend.com/docs/es/>
