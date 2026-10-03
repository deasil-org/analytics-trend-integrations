import { ANALYTICS_DATA_PERMISSION, getBrowserApi, hasDataConsent, trackFromContentScript } from "@analyticstrend/extension";

// Works from any extension page: it hands the event to the background, the
// only context that sends.
trackFromContentScript("popup_opened");

const consentRow = document.querySelector<HTMLElement>("#consent");
const status = document.querySelector<HTMLElement>("#status");

async function refreshConsent() {
  if (consentRow) consentRow.hidden = await hasDataConsent(getBrowserApi());
}

document.querySelector("#allow")?.addEventListener("click", async () => {
  const api = getBrowserApi() as unknown as { permissions?: { request?: (p: unknown) => Promise<boolean> } };
  // Firefox refuses a permission request that did not come from a click.
  await api.permissions?.request?.({ data_collection: [ANALYTICS_DATA_PERMISSION] });
  await refreshConsent();
});

document.querySelector("#hello")?.addEventListener("click", () => {
  trackFromContentScript("hello_clicked", { source: "popup" });
  if (status) status.textContent = "Sent. It reaches the dashboard within the hour.";
});

void refreshConsent();
