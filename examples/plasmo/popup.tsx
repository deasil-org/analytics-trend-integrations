import { useEffect, useState } from "react";
import { ANALYTICS_DATA_PERMISSION, getBrowserApi, hasDataConsent, trackFromContentScript } from "@analyticstrend/extension";

function Popup() {
  const [consented, setConsented] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    // Hands the event to the background, the only context that sends.
    trackFromContentScript("popup_opened");
    void hasDataConsent(getBrowserApi()).then(setConsented);
  }, []);

  async function allow() {
    const api = getBrowserApi() as unknown as { permissions?: { request?: (p: unknown) => Promise<boolean> } };
    // Firefox refuses a permission request that did not come from a click.
    await api.permissions?.request?.({ data_collection: [ANALYTICS_DATA_PERMISSION] });
    setConsented(await hasDataConsent(getBrowserApi()));
  }

  return (
    <main style={{ width: 280, padding: 16, font: "14px/1.5 system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 15, margin: "0 0 8px" }}>AnalyticsTrend with Plasmo</h1>
      <p>Opening this popup sent one event. The button sends another.</p>
      {!consented && (
        <div>
          <p>Analytics are turned off for this extension.</p>
          <button type="button" onClick={() => void allow()}>
            Turn analytics on
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          trackFromContentScript("hello_clicked", { source: "popup" });
          setStatus("Sent. It reaches the dashboard within the hour.");
        }}
      >
        Send an event
      </button>
      <p role="status">{status}</p>
    </main>
  );
}

export default Popup;
