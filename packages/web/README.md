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

**Single-page applications need one more line.** `init` runs once per document load, so
client-side navigation fires nothing and your page views count first loads only. Track route
changes yourself.

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

Only those parameter names are read. The rest of the query string is never looked at, which
matters because query strings routinely carry email addresses and one-time tokens.

To turn it off:

```js
const analytics = init({ writeKey: "wk_your_key_here", autoCapture: false });
```

Full documentation: <https://analyticstrend.com/docs>
