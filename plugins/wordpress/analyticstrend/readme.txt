=== AnalyticsTrend ===
Contributors: deasil
Tags: analytics, statistics, privacy, cookieless, stats
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Product analytics for your site with no cookies and no personal data. Paste your AnalyticsTrend write key and every page is counted.

== Description ==

AnalyticsTrend counts the visits to your site, where they came from and which pages they read, without cookies, without fingerprinting and without keeping anyone's IP address.

This plugin adds the AnalyticsTrend script to every public page of your site. You paste your project's write key under Settings → AnalyticsTrend, and the first page view shows up in your AnalyticsTrend project a few seconds later.

* The script ships inside the plugin and loads from your own site.
* Logged-in administrators and editors are left out of the counts, unless you turn that off.
* Clicks on links to other sites and file downloads can be counted too, if you turn that on.
* Browsers that send Global Privacy Control are not counted.
* Nothing appears on your site's pages: no badge and no link.

You need an AnalyticsTrend project for a website. Its write key is on the project's setup page.

Install guide: [https://analyticstrend.com/docs/guide/install-wordpress](https://analyticstrend.com/docs/guide/install-wordpress)

== External services ==

This plugin sends page views to AnalyticsTrend, a web analytics service run by Deasil, so that you can see them in your AnalyticsTrend project. Nothing is sent until you save a write key.

The plugin itself makes no request to any server. Each visitor's browser runs the bundled script, which sends an event to AnalyticsTrend at analyticstrend.com when a page is viewed, when the page is left (how long it was visible), and, if you turn them on, when a link to another site is followed or a file is downloaded. Each event carries the page's path, the referring site's hostname, any campaign tags (such as utm_source) on the landing address, how long the page was visible, and a random identifier the browser keeps for your site. From the request, AnalyticsTrend reads the country (and in some countries the region), the browser, operating system and device type, and the browser's language. The IP address is used to find the country and is then discarded, never stored.

* Terms of service: [https://analyticstrend.com/terms](https://analyticstrend.com/terms)
* Privacy policy: [https://analyticstrend.com/privacy](https://analyticstrend.com/privacy)
* What AnalyticsTrend collects: [https://analyticstrend.com/docs/guide/what-is-analyticstrend#what-it-collects](https://analyticstrend.com/docs/guide/what-is-analyticstrend#what-it-collects)

The plugin also suggests text for your privacy policy, under Settings → Privacy → Policy Guide.

== Installation ==

1. In WordPress, go to Plugins → Add New Plugin and search for AnalyticsTrend. Install it and activate it.
2. Go to Settings → AnalyticsTrend.
3. Paste the write key from your project's setup page in AnalyticsTrend, and save.
4. Open your site in a private window. The setup page in AnalyticsTrend says when the first page view arrives.

== Frequently Asked Questions ==

= Where do I find my write key? =

On your project's setup page in AnalyticsTrend. It starts with wk_. Create a project for a website first if you don't have one.

= Why don't I see my own visits? =

Logged-in administrators and editors are left out by default, so your own browsing doesn't count. Open your site in a private window, or turn the option off under Settings → AnalyticsTrend.

= Does it work with a caching plugin? =

Yes. The tag is the same for every visitor, so a cached page counts like any other. After changing the settings, clear the cache so the new tag reaches every page.

= My site already has the AnalyticsTrend tag. =

Remove the tag you added by hand. If both stay, a page is still counted once, but one tag is enough.

= Can I send my own events? =

Yes. The script exposes window.analyticsTrend, so a theme or another plugin can call window.analyticsTrend.track("signup"). See the install guide.

= Does it need a cookie banner? =

AnalyticsTrend sets no cookies. Whether your site needs a banner depends on everything else on it, and on the law where you and your visitors are.

== Changelog ==

= 1.0.0 =
* First version: the AnalyticsTrend script on every public page, with the write key, leaving out administrators and editors, and optional link and download events.
