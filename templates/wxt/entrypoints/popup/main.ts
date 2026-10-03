import { analytics } from "#analytics";
import { ANALYTICS_DATA_PERMISSION, getBrowserApi, hasDataConsent } from "@analyticstrend/extension";
import { analyticsEnabled } from "@/utils/analytics-enabled";

const share = document.querySelector<HTMLInputElement>("#share");
const consentRow = document.querySelector<HTMLElement>("#consent");
const allowButton = document.querySelector<HTMLButtonElement>("#allow");
const status = document.querySelector<HTMLElement>("#status");

void analytics.track("popup_opened");

// The person's own switch. The provider follows it, uninstall link included.
if (share) {
  void analyticsEnabled.getValue().then((on) => {
    share.checked = on;
  });
  share.addEventListener("change", () => {
    void analytics.setEnabled(share.checked);
  });
}

// Firefox can turn analytics off too, at install or later in the add-on's
// settings. This offers a way back. Chrome has no such permission, so this
// row never shows there.
async function refreshConsent() {
  if (consentRow) consentRow.hidden = await hasDataConsent(getBrowserApi());
}

allowButton?.addEventListener("click", async () => {
  const api = getBrowserApi() as unknown as { permissions?: { request?: (p: unknown) => Promise<boolean> } };
  // Firefox refuses a permission request that did not come from a click.
  await api.permissions?.request?.({ data_collection: [ANALYTICS_DATA_PERMISSION] });
  await refreshConsent();
});

document.querySelector("#hello")?.addEventListener("click", () => {
  void analytics.track("hello_clicked", { source: "popup" });
  if (status) {
    status.textContent = share?.checked
      ? "Sent. It reaches your dashboard within the hour."
      : "Not sent: sharing is off.";
  }
});

void refreshConsent();
