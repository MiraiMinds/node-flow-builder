// React Flow adds selected/measured/dragging/handle fields. Never send them to Mirai.
export function toApiGraph(nodes, edges) {
  return {
    nodes: nodes.map(({ id, type, position, data }) => ({
      id,
      type,
      position,
      data,
    })),
    edges: edges.map(({ id, source, target, data }) => ({
      id,
      source,
      target,
      data,
    })),
  };
}

export function toCanvasGraph(graph) {
  return {
    nodes: structuredClone(graph.nodes),
    edges: graph.edges.map((edge) => ({
      ...structuredClone(edge),
      type: "smoothstep",
      label: edge.data.label,
    })),
  };
}

// A small editor check; the public /flow/validate and agent save are authoritative.
export function graphProblems(graph) {
  const issues = [];
  const nodes = graph.nodes || [],
    edges = graph.edges || [];
  const ids = new Set(nodes.map((n) => n.id));
  const identifier = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;
  if (nodes.length < 2 || nodes.length > 20) issues.push("Use 2–20 nodes.");
  if (edges.length < 1 || edges.length > 40)
    issues.push("Use 1–40 transitions.");
  if (ids.size !== nodes.length || nodes.some((n) => !identifier.test(n.id)))
    issues.push("Node IDs must be unique function identifiers.");
  if (nodes.filter((n) => n.type === "startCall").length !== 1)
    issues.push("Use exactly one start node.");
  if (!nodes.some((n) => n.type === "endCall")) issues.push("Add an end node.");
  if (nodes.filter((n) => n.type === "globalNode").length > 1)
    issues.push("Use at most one global node.");
  if (new Set(edges.map((e) => e.id)).size !== edges.length)
    issues.push("Transition IDs must be unique.");
  const labels = new Set(edges.map((e) => e.data?.label));
  const seen = new Set();
  for (const n of nodes) {
    if (!["startCall", "agentNode", "endCall", "globalNode"].includes(n.type))
      issues.push(`Unsupported node type: ${n.type}.`);
    if (!n.data?.name?.trim() || !n.data?.prompt?.trim())
      issues.push(`${n.id}: add a name and prompt.`);
    for (const name of n.data?.tools || []) {
      if (!["startCall", "agentNode"].includes(n.type))
        issues.push(`${n.id}: only conversation nodes offer tools.`);
      if (labels.has(name))
        issues.push(`${name}: tool names must not match transition labels.`);
    }
  }
  for (const e of edges) {
    const source = nodes.find((n) => n.id === e.source),
      target = nodes.find((n) => n.id === e.target);
    if (
      !source ||
      !target ||
      ["endCall", "globalNode"].includes(source?.type) ||
      target?.type === "globalNode"
    )
      issues.push(`${e.id}: invalid connection.`);
    if (!identifier.test(e.data?.label || "") || !e.data?.condition?.trim())
      issues.push(`${e.id}: add a function label and condition.`);
    const key = `${e.source}:${e.data?.label}`;
    if (seen.has(key))
      issues.push(`${e.id}: duplicate transition label on this node.`);
    seen.add(key);
  }
  const reachable = (start) => {
    const visited = new Set(),
      pending = [start];
    while (pending.length) {
      const id = pending.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      pending.push(
        ...edges.filter((e) => e.source === id).map((e) => e.target),
      );
    }
    return visited;
  };
  const start = nodes.find((n) => n.type === "startCall");
  const fromStart = reachable(start?.id);
  for (const n of nodes.filter((n) => n.type !== "globalNode")) {
    if (!fromStart.has(n.id)) issues.push(`${n.id}: connect it to the start.`);
    if (
      !nodes.some(
        (end) => end.type === "endCall" && reachable(n.id).has(end.id),
      )
    )
      issues.push(`${n.id}: add a path to an end node.`);
  }
  return [...new Set(issues)];
}
