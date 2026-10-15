"""Sending events to AnalyticsTrend from a Python server, over HTTP, with no SDK.

Only the standard library: the same request works from anything that can POST JSON.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

WRITE_KEY = os.environ.get("ANALYTICSTREND_WRITE_KEY")
ENDPOINT = os.environ.get("ANALYTICSTREND_ENDPOINT", "https://analyticstrend.com/v1/collect")
if not WRITE_KEY:
    sys.exit("Set ANALYTICSTREND_WRITE_KEY to your project's write key.")

# One random id per user, made once and kept. A server sending on a user's
# behalf would use the id that user's app keeps; this example keeps its own.
# Never an email address, an account id or a device identifier.
ID_FILE = Path(__file__).with_name(".analyticstrend-id")


def anonymous_id() -> str:
    if ID_FILE.exists():
        return ID_FILE.read_text().strip()
    new_id = str(uuid.uuid4())
    ID_FILE.write_text(new_id)
    return new_id


def event(name: str, props: dict | None = None) -> dict:
    """Each event gets its own id when it happens, so a retry sends the same ids."""
    made = {"id": str(uuid.uuid4()), "name": name, "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
    if props:
        made["props"] = props
    return made


batch = {
    "writeKey": WRITE_KEY,
    "client": "app",
    "clientVersion": "example-python-1.0.0",
    "appVersion": "1.0.0",
    "anonymousId": anonymous_id(),
    # A server's own address is not the user's: no country or region from it.
    "location": False,
    "events": [event("app_opened"), event("report_exported", {"format": "csv"})],
}


def send(body: dict) -> tuple[int, str]:
    """A network error or a 5xx is retried with the same body; a 4xx is not."""
    data = json.dumps(body).encode()
    delays = [0.5, 1, 2]
    for attempt in range(len(delays) + 1):
        request = urllib.request.Request(ENDPOINT, data=data, headers={"content-type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status, response.read().decode()
        except urllib.error.HTTPError as error:
            if error.code < 500 or attempt == len(delays):
                return error.code, error.read().decode()
        except urllib.error.URLError:
            if attempt == len(delays):
                raise
        time.sleep(delays[attempt])
    raise RuntimeError("unreachable")


status, text = send(batch)
print(status, text)
