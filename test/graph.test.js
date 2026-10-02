import { test } from "node:test";
import assert from "node:assert/strict";
import { example } from "../shared/example.js";
import { graphProblems, toApiGraph, toCanvasGraph } from "../shared/graph.js";

test("canvas metadata is stripped without losing node tools, extraction or positions", () => {
  const graph = structuredClone(example.flow);
  graph.nodes[2].data.tools = ["lookup_order"];
  const canvas = toCanvasGraph(graph);
  canvas.nodes[0].selected = true;
  canvas.nodes[0].measured = { width: 260, height: 180 };
  canvas.edges[0].sourceHandle = null;
  assert.deepEqual(toApiGraph(canvas.nodes, canvas.edges), graph);
});
test("sample graph is connected and all conversation nodes can end", () =>
  assert.deepEqual(graphProblems(example.flow), []));
test("catches a reachable cycle with no exit and an isolated node", () => {
  const graph = structuredClone(example.flow);
  graph.edges = graph.edges.filter((e) => e.id !== "resolved");
  graph.edges.push({
    id: "loop",
    source: "delivery",
    target: "delivery",
    data: { label: "retry", condition: "Try again" },
  });
  graph.nodes.push({
    id: "orphan",
    type: "agentNode",
    data: { name: "Unreachable", prompt: "Help." },
  });
  assert.ok(
    graphProblems(graph).includes("delivery: add a path to an end node."),
  );
  assert.ok(graphProblems(graph).includes("orphan: connect it to the start."));
});
test("tools cannot collide with a transition anywhere in the graph", () => {
  const graph = structuredClone(example.flow);
  graph.nodes[2].data.tools = ["finish_greeting"];
  assert.ok(
    graphProblems(graph).some((p) => p.includes("tool names must not match")),
  );
});
