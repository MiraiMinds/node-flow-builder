import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { createApp } from "../server/app.js";
import { createMiraiClient } from "../server/mirai.js";
import { createToolService } from "../server/tool-service.js";
import { example } from "../shared/example.js";

async function start(t, app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (path, method = "GET", body, headers = {}) => {
    if (headers.Host)
      return new Promise((resolve, reject) => {
        const req = httpRequest(base + path, { method, headers }, (res) => {
          let raw = "";
          res.on("data", (chunk) => {
            raw += chunk;
          });
          res.on("end", () =>
            resolve({ status: res.statusCode, body: JSON.parse(raw) }),
          );
        });
        req.on("error", reject);
        req.end();
      });
    const res = await fetch(base + path, {
      method,
      headers: {
        "X-Example-Client": "flow-builder",
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, headers: res.headers, body: await res.json() };
  };
}
test("live proxy keeps credentials server-side and preserves revisions, graph and upstream errors", async (t) => {
  const seen = [];
  const client = createMiraiClient({
    baseUrl: "https://api.example.com",
    apiKey: "test-key-not-a-real-secret",
    fetchImpl: async (url, init) => {
      seen.push({ url: url.href, ...init });
      return new Response(
        JSON.stringify({
          error: "invalid_flow",
          details: [{ path: "flow.nodes", message: "test issue" }],
        }),
        { status: 400, headers: { "Retry-After": "3" } },
      );
    },
  });
  const http = await start(t, createApp({ mode: "live", client }));
  const body = { flow: example.flow, tools: [], if_revision: 9 };
  const result = await http("/api/mirai/v2/agents/agt_example", "PATCH", body);
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "invalid_flow");
  assert.equal(result.body.details[0].path, "flow.nodes");
  assert.equal(result.headers.get("retry-after"), "3");
  assert.equal(
    seen[0].headers.Authorization,
    "Bearer test-key-not-a-real-secret",
  );
  assert.equal(seen[0].redirect, "error");
  assert.deepEqual(JSON.parse(seen[0].body), body);
  assert.ok(!JSON.stringify(result.body).includes("test-key"));
});
test("rejects cross-origin access, rebinding hosts, unknown operations and calls without keys", async (t) => {
  let count = 0;
  const http = await start(
    t,
    createApp({
      client: async () => {
        count++;
        return { status: 200, body: {} };
      },
    }),
  );
  assert.equal(
    (
      await http("/api/config", "GET", undefined, {
        Origin: "https://other.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await http("/api/config", "GET", undefined, { Host: "attacker.example" }))
      .status,
    403,
  );
  assert.equal(
    (
      await http("/api/mirai/v2/agents", "GET", undefined, {
        "X-Example-Client": "",
      })
    ).status,
    403,
  );
  assert.equal((await http("/api/mirai/v2/admin/secrets")).status, 404);
  assert.equal(
    (await http("/api/mirai/v2/agents?url=https://other.example")).status,
    400,
  );
  assert.equal((await http("/api/mirai/v2/calls", "POST", {})).status, 400);
  assert.equal(count, 0);
});
test("call retries forward the exact idempotency key and payload", async (t) => {
  const seen = [];
  const http = await start(
    t,
    createApp({
      client: async (...args) => {
        seen.push(args);
        return { status: 201, body: { id: "call_test" } };
      },
    }),
  );
  const body = {
    agent_id: "agt_test",
    agent_revision: 4,
    phone_number_id: "pn_test",
    to: "+12025550101",
    variables: { priority: 2 },
  };
  for (let i = 0; i < 2; i++)
    await http("/api/mirai/v2/calls", "POST", body, {
      "Idempotency-Key": "same-attempt-key",
    });
  assert.deepEqual(seen[0], ["POST", "/v2/calls", body, "same-attempt-key"]);
  assert.deepEqual(seen[1], seen[0]);
});
test("uncertain network writes are not retried automatically", async () => {
  let attempts = 0;
  const client = createMiraiClient({
    baseUrl: "https://api.example.com",
    apiKey: "fixture",
    fetchImpl: async () => {
      attempts++;
      throw new Error("connection dropped");
    },
  });
  await assert.rejects(
    client("POST", "/v2/calls", {}),
    (e) => e.status === 502 && e.body.error.code === "upstream_unreachable",
  );
  assert.equal(attempts, 1);
  assert.throws(() =>
    createMiraiClient({
      baseUrl: "http://insecure.example",
      apiKey: "fixture",
    }),
  );
  assert.throws(() =>
    createMiraiClient({ baseUrl: "https://api.example.com", apiKey: "" }),
  );
});
test("demo walks create, update, conflict, publish, assign number and idempotent call without network", async (t) => {
  const http = await start(t, createApp());
  const path = "/api/mirai/v2";
  assert.equal(
    (await http(`${path}/agents/flow/validate`, "POST", example.flow)).body.ok,
    true,
  );
  let agent = (await http(`${path}/agents`, "POST", example)).body;
  assert.equal(agent.revision, 1);
  agent = (
    await http(`${path}/agents/${agent.id}`, "PATCH", {
      name: "Updated",
      if_revision: 1,
    })
  ).body;
  assert.equal(agent.name, "Updated");
  assert.equal(
    (
      await http(`${path}/agents/${agent.id}`, "PATCH", {
        name: "Stale",
        if_revision: 1,
      })
    ).status,
    409,
  );
  agent = (
    await http(`${path}/agents/${agent.id}/publish`, "POST", {
      if_revision: agent.revision,
    })
  ).body;
  assert.equal(agent.draft, false);
  const number = (await http(`${path}/phone-numbers`)).body.data[0];
  assert.equal(
    (
      await http(`${path}/phone-numbers/${number.id}`, "PATCH", {
        version: number.version,
        agent_id: agent.id,
      })
    ).body.agent_id,
    agent.id,
  );
  const body = {
      agent_id: agent.id,
      phone_number_id: number.id,
      to: "+12025550101",
    },
    headers = { "Idempotency-Key": "demo-attempt-key" };
  const call = (await http(`${path}/calls`, "POST", body, headers)).body;
  assert.equal(
    (await http(`${path}/calls`, "POST", body, headers)).body.id,
    call.id,
  );
  assert.equal((await http(`${path}/calls/${call.id}`)).body.demo, true);
});
test("sample tool requires its own secret and returns only the explicit sample order", async (t) => {
  const secret = "fixture-only-secret-123456789";
  const http = await start(t, createToolService(secret));
  assert.equal(
    (await http("/tools/lookup-order", "POST", { order_id: "DEMO-1042" }))
      .status,
    401,
  );
  const headers = { Authorization: `Bearer ${secret}` };
  assert.equal(
    (
      await http(
        "/tools/lookup-order",
        "POST",
        { order_id: "DEMO-1042" },
        headers,
      )
    ).body.sample_data,
    true,
  );
  assert.equal(
    (
      await http(
        "/tools/lookup-order",
        "POST",
        { order_id: "not-an-order" },
        headers,
      )
    ).body.found,
    false,
  );
});
