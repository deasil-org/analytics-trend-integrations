import { getBrowserApi, hasDataConsent, ANALYTICS_DATA_PERMISSION } from "@analyticstrend/extension";
import { trackFromContentScript } from "@analyticstrend/extension";

// trackFromContentScript works from any extension page, the popup included:
// it messages the background context, which is the only thing that sends.
trackFromContentScript("popup_opened");

const consentRow = document.querySelector<HTMLElement>("#consent");
const allowButton = document.querySelector<HTMLButtonElement>("#allow");
const status = document.querySelector<HTMLElement>("#status");

// Firefox lets someone decline analytics during installation, and honouring
// that is the extension's job — the SDK sends nothing while it is declined.
// This offers them a way back without hunting through add-on settings. On
// Chrome, where there is no such permission, consent is always granted and this
// row never appears.
async function refreshConsent() {
  if (!consentRow) return;
  consentRow.hidden = await hasDataConsent(getBrowserApi());
}

allowButton?.addEventListener("click", async () => {
  const api = getBrowserApi() as unknown as {
    permissions?: { request?: (p: unknown) => Promise<boolean> };
  };

  // Must be called from a click: Firefox refuses a permission request that did
  // not come from something the person did.
  await api.permissions?.request?.({ data_collection: [ANALYTICS_DATA_PERMISSION] });
  await refreshConsent();
});

document.querySelector("#hello")?.addEventListener("click", () => {
  trackFromContentScript("hello_clicked", { source: "popup" });
  if (status) status.textContent = "Sent. It reaches the dashboard within the hour.";
});

void refreshConsent();
