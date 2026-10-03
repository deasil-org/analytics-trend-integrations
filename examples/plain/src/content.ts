// A content script runs inside a page the extension does not own. It cannot
// hold a durable queue, so it hands events to the background context.
import { trackFromContentScript } from "@analyticstrend/extension";

// The event name only — never the page's URL or title. The page belongs to
// whoever is browsing it, and a URL is exactly the kind of personal detail
// this product exists not to collect.
trackFromContentScript("page_visited");
