[English](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/wxt-analytics/README.md) · [Français](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/wxt-analytics/README.fr.md) · **Español** · [Português](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/wxt-analytics/README.pt-BR.md) · [Deutsch](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/wxt-analytics/README.de.md)

# @analyticstrend/wxt-analytics

AnalyticsTrend como proveedor para el módulo de analítica de [WXT](https://wxt.dev). Los eventos
pasan por el SDK de extensiones de AnalyticsTrend, así que sobreviven a un segundo plano
suspendido, respetan el consentimiento de recopilación de datos de Firefox y Global Privacy
Control, y pueden registrar las desinstalaciones. El propio interruptor de WXT lo controla todo.

```bash
npm install @analyticstrend/wxt-analytics @analyticstrend/extension @wxt-dev/analytics@0.5.4
```

Usa `@wxt-dev/analytics` 0.5.4 con npm: las versiones 0.5.5 y 0.5.6 publican un script
`postinstall` de desarrollo que falla con npm. pnpm, que omite los scripts de instalación de las
dependencias, funciona con cualquiera de ellas.

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

## Lo que llega a AnalyticsTrend

| WXT entrega al proveedor | Qué pasa |
| --- | --- |
| `track`: el nombre del evento y sus propiedades | Se envían como el evento y sus propiedades |
| Un clic registrado automáticamente: etiqueta, id, clase | Se envían |
| Un clic registrado automáticamente: texto y enlace | Se descartan. En un sitio web son el contenido de ese sitio y una dirección completa |
| `page(url)` | `page_viewed`, con `path` solo para las páginas propias de la extensión |
| `identify` | Se ignora. El SDK conserva su propio identificador aleatorio |
| Idioma, pantalla, referente, dirección, título, sesión | Nunca se envían |

Guía completa: <https://analyticstrend.com/docs/es/guide/install-wxt>
