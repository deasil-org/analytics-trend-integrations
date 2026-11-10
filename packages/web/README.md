**English** · [Français](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.fr.md) · [Español](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.es.md) · [Português](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.pt-BR.md) · [Deutsch](https://github.com/deasil-org/analytics-trend-integrations/blob/main/packages/web/README.de.md)

# @analyticstrend/web

Product analytics for websites. No cookies, no fingerprinting, no personal data.

```bash
npm install @analyticstrend/web
```

```js
import { init } from "@analyticstrend/web";

const analytics = init({ writeKey: "wk_your_key_here" });

analytics.track("page_view");
```

`init` sends anything left over from a previous visit, and flushes again as the page is
leaving.

**Single-page applications need one more line.** `init` runs once per document load, so on its
own it counts first loads only, and client-side navigation fires nothing. Pass
`pageViews: "history"` to send a page view now and another each time the path changes, in-app
navigation and the back and forward buttons included:

```js
const analytics = init({ writeKey: "wk_your_key_here", pageViews: "history" });
```

Only the path counts: a new query string or hash alone is the same page. If your app already
sends its own `page_view` on each route change, a page view for the page just counted is not
sent again, so turning this on does not count a page twice. The script tag counts page views
this way by default.

## What is captured

From 0.2.0 the SDK adds a few properties of its own, so that traffic sources and page flow
work without your wiring anything up:

| Property | From |
| --- | --- |
| `$referrer` | the referring site's hostname, when it is not your own |
| `$utm_source`, `$utm_medium`, `$utm_campaign`, `$utm_content`, `$utm_term` | the landing URL |
| `$ref` | the `ref` or `source` parameter |
| `$click_id` | the *name* of a `gclid`, `msclkid` or `fbclid` parameter, never its value |
| `$path` | the current path |
| `$from_path` | the previous path, on page views |
| `$engaged_ms` | how long the page was visible, on `page_engagement` only (from 0.6.0) |

Only those parameter names are read. The rest of the query string is never looked at, which
matters because query strings routinely carry email addresses and one-time tokens.

From 0.6.0 it also sends a `page_engagement` event when the page is hidden or closed, and
when a single-page app moves to another path, saying how long the page was visible: never
under a second, at most 30 minutes in one event. That is what visit duration and bounce rate
are counted from. It is a new kind of collection that is on by default, so check that your
privacy wording covers how long pages are viewed. `init({ engagement: false })`, or
`data-engagement="false"` on the script tag, turns it off on its own.

To turn all of it off:

```js
const analytics = init({ writeKey: "wk_your_key_here", autoCapture: false });
```

## The script tag, without attributes

From 0.8.0 the script tag (`dist/script.js`) also reads its options from
`window.analyticsTrendConfig`, for an install that can't set attributes on the tag, such as
Google Tag Manager. The keys are the tag's attributes in camelCase, with the same string values,
and an attribute on the tag wins over the same key here.

```html
<script>
  window.analyticsTrendConfig = { writeKey: "wk_your_key_here", outboundLinks: "true" };
  window.analyticsTrendQueue = window.analyticsTrendQueue || [];
  window.analyticsTrendQueue.push(["signup", { plan: "pro" }]);
</script>
```

Events pushed onto `window.analyticsTrendQueue` before the script loads are sent once it starts,
and a push after that is sent at once. A second copy of the script with the same write key starts
nothing, so a page with the tag on it twice is not counted twice.

## Automated browsers

A browser driven by automation, such as Puppeteer, Playwright or Selenium, sends nothing and
stores nothing: `navigator.webdriver` is true there, and such a browser is a crawler far more
often than a person. The flag is read in the browser and never sent. If your own end-to-end
tests check the events your site sends, count them anyway:

```js
const analytics = init({ writeKey: "wk_your_key_here", countAutomatedBrowsers: true });
```

On the script tag, that is `data-count-automated="true"`.

Full documentation: <https://analyticstrend.com/docs>
