import type { BrowserApi } from "./browser.ts";

// Firefox's data-collection category for product analytics. Mozilla's manifest
// schema accepts it only as an optional permission, never a required one, and
// Firefox shows it as a toggle during installation.
export const ANALYTICS_DATA_PERMISSION = "technicalAndInteraction";

// Firefox's category for location. The collector works a country, and in some
// countries a region, out of each request's address, which Mozilla counts
// here. Declared as optional, it is a second toggle: someone can allow their
// use to be counted without a location.
export const LOCATION_DATA_PERMISSION = "locationInfo";

/**
 * Whether a data-collection permission allows collection right now.
 *
 * Firefox does not enforce data-collection permissions technically: it records
 * the person's choice and shows it in the add-on's settings, and respecting it
 * is the extension's job. An SDK that ignored it would quietly make every
 * extension using it break Mozilla's policy — and break the promise the toggle
 * makes to the person who turned it off.
 *
 * A choice is only required when this extension offers it. The manifest is the
 * source of truth: an extension that declares the permission as optional has
 * offered the toggle, so the answer must be honoured. One that declares nothing
 * — every Chrome extension, and any Firefox extension not using the framework —
 * has nothing to check, and gating on a permission nobody was offered would
 * silently stop those extensions from sending anything.
 */
async function allowedBy(api: BrowserApi, permission: string): Promise<boolean> {
  const manifest = api.runtime.getManifest?.() as
    | {
        browser_specific_settings?: {
          gecko?: { data_collection_permissions?: { optional?: string[] } };
        };
      }
    | undefined;

  const optional =
    manifest?.browser_specific_settings?.gecko?.data_collection_permissions?.optional ?? [];
  if (!optional.includes(permission)) return true;

  // Chrome has no data-collection permission model, and Firefox gained one in
  // 140. Where the browser cannot answer, a declared-but-unanswerable
  // permission is treated as granted: the alternative is an extension that
  // sends nothing on older Firefox for a toggle that was never shown.
  const granted = await api.permissions?.getAll?.();
  if (!granted || !("data_collection" in granted)) return true;

  return granted.data_collection?.includes(permission) === true;
}

/** Whether this extension may collect analytics right now. */
export function hasDataConsent(api: BrowserApi): Promise<boolean> {
  return allowedBy(api, ANALYTICS_DATA_PERMISSION);
}

/**
 * Whether the collector may work a location out of this extension's requests
 * right now. When it may not, events are still sent, marked location: false,
 * and the collector looks nothing up.
 */
export function hasLocationConsent(api: BrowserApi): Promise<boolean> {
  return allowedBy(api, LOCATION_DATA_PERMISSION);
}

/**
 * Calls back whenever data-collection consent may have changed, so a client can
 * re-check it. Firefox fires these when the person flips a toggle in the
 * add-on's settings, long after installation.
 */
export function onDataConsentChanged(api: BrowserApi, listener: () => void): void {
  api.permissions?.onAdded?.addListener(listener);
  api.permissions?.onRemoved?.addListener(listener);
}
