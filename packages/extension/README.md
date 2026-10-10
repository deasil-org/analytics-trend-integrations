# @analyticstrend/extension

Product analytics for Chromium and Firefox extensions. No remote code, so it clears
Manifest V3 and Mozilla's review policy.

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

Events are written to extension storage before any send, so a suspended service worker
mid-flush loses nothing and never sends twice.

**Firefox note.** Chrome remembers an uninstall URL across restarts; Firefox forgets it when
its event page unloads. Passing `uninstallTracking: true` re-registers on every start, which
is why registering from an `onInstalled` handler instead works on Chrome forever and stops
working on Firefox within a minute.

Full documentation: <https://analyticstrend.com/docs>
