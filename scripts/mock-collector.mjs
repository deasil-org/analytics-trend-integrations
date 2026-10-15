// A stand-in for the collector's POST /v1/collect, for trying an app example
// without a project: it checks each batch with the same rules the collector
// uses (@analyticstrend/event-schema), answers as the collector does, and
// keeps what it accepted so a script can look at it.
//
//   pnpm mock-collector            listens on port 47300
//
// It listens on every interface, so an example running in a container reaches
// it at host.docker.internal.
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { validateBatch } from "../packages/event-schema/dist/index.js";

export const MOCK_PORT = 47300;

export function startMockCollector({ port = MOCK_PORT } = {}) {
  const received = [];
  const server = createServer((request, response) => {
    const answer = (status, body) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (request.method !== "POST" || request.url !== "/v1/collect") return answer(404, { error: "Not found" });

    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return answer(400, { error: "Body must be JSON" });
      }
      const result = validateBatch(body, new Date());
      if (!result.ok) return answer(400, { error: result.error });
      received.push(result.batch);
      return answer(202, { accepted: result.batch.events.length, rejectedNames: [], invalidEvents: [] });
    });
  });

  return new Promise((resolve) => {
    server.listen(port, "0.0.0.0", () => {
      const { port: bound } = server.address();
      resolve({
        url: `http://localhost:${bound}`,
        received,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const mock = await startMockCollector();
  console.log(`Mock collector at ${mock.url}/v1/collect`);
}
