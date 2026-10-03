import { ApiError } from "./mirai.js";
import { graphProblems } from "../shared/graph.js";

// In-memory teaching fixtures. This never simulates speech or contacts a provider.
export function createDemoClient() {
  const agents = new Map(),
    calls = new Map(),
    requests = new Map();
  let number = {
    id: "pn_demo",
    number: "+12025550100",
    state: "ready",
    connection_state: "verified",
    version: 1,
    agent_id: "",
  };
  const fail = (status, code, message) => {
    throw new ApiError(status, { error: { code, message } });
  };
  return async (method, path, body, key) => {
    const url = new URL(path, "https://demo.invalid");
    const p = url.pathname.split("/").filter(Boolean);
    let data,
      status = 200;
    if (path === "/v2/voices")
      data = { data: [{ voice_id: "neha", name: "Neha" }] };
    else if (path === "/v2/agents/flow/validate") {
      const problems = graphProblems(body);
      if (problems.length)
        throw new ApiError(400, {
          error: "invalid_flow",
          details: problems.map((message) => ({ path: "flow", message })),
        });
      data = {
        ok: true,
        nodes: body.nodes.length,
        edges: body.edges.length,
        demo: true,
      };
    } else if (p[1] === "agents") {
      if (p.length === 2) {
        if (method === "GET")
          data = { data: [...agents.values()], has_more: false };
        else {
          data = {
            ...structuredClone(body),
            id: `agt_${crypto.randomUUID().replaceAll("-", "")}`,
            object: "agent",
            revision: 1,
          };
          agents.set(data.id, data);
          status = 201;
        }
      } else {
        const agent = agents.get(p[2]);
        if (!agent)
          fail(
            404,
            "not_found",
            "Demo agent not found. Demo state resets when the server restarts.",
          );
        if (method === "PATCH" || p[3] === "publish") {
          if (body.if_revision !== agent.revision)
            fail(409, "conflict", "The agent changed. Reload before saving.");
          const { if_revision, ...changes } = body;
          data = {
            ...agent,
            ...structuredClone(changes),
            ...(p[3] === "publish" ? { draft: false } : {}),
            revision: agent.revision + 1,
          };
          agents.set(data.id, data);
        } else if (p[3] === "preview")
          data = { demo: true, variables: body.variables, flow: agent.flow };
        else data = agent;
      }
    } else if (p[1] === "phone-numbers") {
      if (p[2] && p[2] !== number.id)
        fail(404, "not_found", "Demo number not found.");
      if (method === "PATCH" || method === "POST") {
        if (body.version !== number.version)
          fail(409, "conflict", "Reload the number version.");
        number = {
          ...number,
          ...(method === "PATCH"
            ? { agent_id: body.agent_id }
            : { state: "ready", connection_state: "verified" }),
          version: number.version + 1,
        };
      }
      data = p[2] ? number : { data: [number], has_more: false };
    } else if (p[1] === "calls") {
      if (method === "POST" && p.length === 2) {
        if (requests.has(key)) {
          const saved = requests.get(key);
          if (saved.body !== JSON.stringify(body))
            fail(
              409,
              "idempotency_conflict",
              "Use the same body for this call key.",
            );
          return { status: 201, body: saved.result };
        }
        const agent = agents.get(body.agent_id);
        if (!agent || agent.draft)
          fail(400, "invalid_request", "Publish the demo agent first.");
        data = {
          id: `call_${crypto.randomUUID().replaceAll("-", "")}`,
          status: "completed",
        };
        calls.set(data.id, {
          ...data,
          ...body,
          demo: true,
          flow: {
            nodes_visited: [],
            variables: {},
            note: "Demo only: no conversation ran and no phone was dialed.",
          },
        });
        requests.set(key, { body: JSON.stringify(body), result: data });
        status = 201;
      } else {
        data = calls.get(p[2]);
        if (!data) fail(404, "not_found", "Demo call not found.");
        if (p[3] === "tool_runs") data = { data: [], has_more: false };
      }
    } else
      fail(404, "not_found", "This operation is available only in live mode.");
    return { status, body: structuredClone(data) };
  };
}
