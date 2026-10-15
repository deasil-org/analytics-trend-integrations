// Runs every app example against the mock collector, twice, and fails if any
// example does not run or sends what the collector would refuse:
//
//   pnpm check:app-examples                   every example
//   pnpm check:app-examples --only node,rust  some of them
//
// Each run must send a batch from client "app" with the app's version and the
// example's events. The second run must keep the first run's anonymous id and
// send new event ids. The server examples must leave location out. Examples
// whose toolchain is not usually installed run in its official image, so only
// Node, Rust and Docker are needed here.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MOCK_PORT, startMockCollector } from "./mock-collector.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEN_MINUTES = 10 * 60_000;
const APP = ["app_opened", "note_created"];
const SERVER = ["app_opened", "report_exported"];

// name → where it is, how it runs, and what it should send. A test-only
// example runs its own tests instead of sending.
export const EXAMPLES = {
  node: { dir: "examples/app-node", native: ["node", "main.mjs"], events: SERVER, server: true },
  python: { dir: "examples/app-python", image: "python:3.12-slim", command: ["python", "main.py"], events: SERVER, server: true },
  rust: { dir: "examples/app-rust", native: ["cargo", "run", "--quiet"], events: APP },
  tauri: { dir: "examples/app-tauri/src-tauri", native: ["cargo", "test", "--quiet"], testOnly: true },
  swift: { dir: "examples/app-swift", image: "swift:5.10", command: ["swift", "run", "--quiet"], events: APP },
  kotlin: { dir: "examples/app-kotlin", image: "gradle:8.10-jdk21", command: ["gradle", "run", "--no-daemon", "--quiet"], events: APP },
  dotnet: { dir: "examples/app-dotnet", image: "mcr.microsoft.com/dotnet/sdk:8.0", command: ["dotnet", "run"], events: APP },
};

function run(example, endpoint) {
  const dir = path.join(ROOT, example.dir);
  const env = { ANALYTICSTREND_WRITE_KEY: "wk_example", ANALYTICSTREND_ENDPOINT: endpoint };
  const [command, args] = example.image
    ? [
        "docker",
        [
          // host.docker.internal is built into Docker Desktop; on Linux this
          // flag adds it, and Docker Desktop ignores it.
          "run", "--rm", "--add-host=host.docker.internal:host-gateway", "-v", `${dir}:/app`, "-w", "/app",
          ...Object.entries(env).flatMap(([name, value]) => ["-e", `${name}=${value.replace("localhost", "host.docker.internal")}`]),
          example.image, ...example.command,
        ],
      ]
    : [example.native[0], example.native.slice(1)];
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: dir, env: { ...process.env, ...env } });
    // A command that cannot start (not installed) is a failed run, not a crash.
    child.on("error", (error) => resolve({ code: -1, output: error.message }));
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    const timer = setTimeout(() => child.kill(), TEN_MINUTES);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

// What was wrong with the batches one run sent, or null.
function problemWith(example, batches, earlier) {
  const batch = batches.at(-1);
  if (!batch) return "sent nothing";
  if (batch.client !== "app") return `sent client "${batch.client}", not "app"`;
  if (!batch.appVersion) return "sent no appVersion";
  const names = batch.events.map((event) => event.name);
  if (example.events.some((name) => !names.includes(name))) return `sent ${names.join(", ")}, not ${example.events.join(", ")}`;
  if (example.server && batch.location !== false) return "a server example must send location: false";
  if (earlier) {
    if (batch.anonymousId !== earlier.anonymousId) return "did not keep its anonymous id between runs";
    const before = new Set(earlier.events.map((event) => event.id));
    if (batch.events.some((event) => before.has(event.id))) return "sent the same event ids on a second run";
  }
  return null;
}

async function check(name, example, mock) {
  if (!existsSync(path.join(ROOT, example.dir))) return `FAIL ${name}: ${example.dir} does not exist`;
  if (example.testOnly) {
    const { code, output } = await run(example, `${mock.url}/v1/collect`);
    return code === 0 ? `ok ${name} (its tests)` : `FAIL ${name}: its tests failed\n${output}`;
  }
  rmSync(path.join(ROOT, example.dir, ".analyticstrend-id"), { force: true });
  let earlier = null;
  for (const attempt of [1, 2]) {
    const start = mock.received.length;
    const { code, output } = await run(example, `${mock.url}/v1/collect`);
    if (code !== 0) return `FAIL ${name}: run ${attempt} exited ${code}\n${output}`;
    const batches = mock.received.slice(start);
    const problem = problemWith(example, batches, earlier);
    if (problem) return `FAIL ${name}: run ${attempt} ${problem}\n${output}`;
    earlier = batches.at(-1);
  }
  return `ok ${name} (2 runs)`;
}

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1]?.split(",") : null;
const chosen = Object.entries(EXAMPLES).filter(([name]) => !only || only.includes(name));
if (chosen.length === 0) {
  console.error(`No such example. These exist: ${Object.keys(EXAMPLES).join(", ")}`);
  process.exit(1);
}
if (chosen.some(([, example]) => example.image) && spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
  console.error("Docker is not running: start it, or pass --only node,rust,tauri");
  process.exit(1);
}

const mock = await startMockCollector({ port: MOCK_PORT });
let failed = false;
for (const [name, example] of chosen) {
  const line = await check(name, example, mock);
  failed ||= line.startsWith("FAIL");
  console.log(line);
}
await mock.close();
process.exit(failed ? 1 : 0);
