import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./style.css";
import { example, exampleVariables, exampleTool } from "../shared/example.js";
import { toApiGraph, toCanvasGraph, graphProblems } from "../shared/graph.js";
import { request, mirai } from "./api.js";

const pretty = (value) => JSON.stringify(value, null, 2);
const types = {
  startCall: "Start",
  agentNode: "Conversation",
  endCall: "End",
  globalNode: "Global instructions",
};
function FlowNode({ data, type, selected }) {
  return (
    <div className={`flow-node ${type} ${selected ? "selected" : ""}`}>
      {type !== "globalNode" && (
        <Handle type="target" position={Position.Left} />
      )}
      <div className="node-kind">
        <span className="node-dot" />
        {types[type]}
      </div>
      <strong>{data.name}</strong>
      <p>
        {type === "startCall" && data.greeting ? data.greeting : data.prompt}
      </p>
      {!!data.tools?.length && (
        <span className="node-detail">
          {data.tools.length} tool{data.tools.length > 1 ? "s" : ""}
        </span>
      )}
      {data.extraction_enabled && (
        <span className="node-detail">
          Extracts {data.extraction_variables?.length || 0} values
        </span>
      )}
      {["startCall", "agentNode"].includes(type) && (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  );
}
const nodeTypes = Object.fromEntries(
  Object.keys(types).map((type) => [type, FlowNode]),
);
function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function JsonField({ label, value, setValue, hint }) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        className="code"
        rows={10}
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </Field>
  );
}

function App() {
  const initial = useMemo(() => toCanvasGraph(example.flow), []);
  const [nodes, setNodes] = useState(initial.nodes),
    [edges, setEdges] = useState(initial.edges);
  const [selected, select] = useState({ kind: "node", id: "hello" });
  const [tab, setTab] = useState("Node"),
    [config, setConfig] = useState(null);
  const [agent, setAgent] = useState(null),
    [name, setName] = useState(example.name);
  const [language, setLanguage] = useState("en"),
    [voiceId, setVoiceId] = useState("neha");
  const [inputText, setInputText] = useState(pretty(example.input_schema));
  const [toolsText, setToolsText] = useState("[]"),
    [variablesText, setVariablesText] = useState(pretty(exampleVariables));
  const [agents, setAgents] = useState([]),
    [agentCursor, setAgentCursor] = useState(null),
    [loadId, setLoadId] = useState("");
  const [numbers, setNumbers] = useState([]),
    [numberCursor, setNumberCursor] = useState(null),
    [numberId, setNumberId] = useState("");
  const [to, setTo] = useState(""),
    [callId, setCallId] = useState("");
  const [pending, setPending] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("mirai-pending-call") || "null");
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(
      "Start with the sample, or load an existing flow agent.",
    );
  const [result, setResult] = useState(null),
    [saved, setSaved] = useState("");
  const graph = toApiGraph(nodes, edges);
  const signature = pretty({
    name,
    language,
    voiceId,
    inputText,
    toolsText,
    graph,
  });
  const dirty = signature !== saved;
  const node = nodes.find(
    (n) => selected?.kind === "node" && n.id === selected.id,
  );
  const edge = edges.find(
    (e) => selected?.kind === "edge" && e.id === selected.id,
  );
  const number = numbers.find((n) => n.id === numberId);
  let tools = [];
  try {
    const parsed = JSON.parse(toolsText);
    if (Array.isArray(parsed)) tools = parsed;
  } catch {
    /* Save reports invalid JSON. */
  }

  useEffect(() => {
    request("/api/config")
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (pending)
      sessionStorage.setItem("mirai-pending-call", JSON.stringify(pending));
    else sessionStorage.removeItem("mirai-pending-call");
  }, [pending]);
  useEffect(() => {
    const warn = (event) => {
      if (dirty && agent) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, agent]);

  async function run(action, message) {
    setBusy(true);
    setError("");
    try {
      const data = await action();
      if (data !== undefined) setResult(data);
      if (message) setNotice(message);
    } catch (e) {
      setError(e.message);
      if (e.body) setResult(e.body);
    } finally {
      setBusy(false);
    }
  }
  function accept(next) {
    const canvas = toCanvasGraph(next.flow);
    setAgent(next);
    setName(next.name);
    setLanguage(next.language);
    setVoiceId(next.voice.voice_id);
    const input = pretty(next.input_schema ?? {}),
      toolList = pretty(next.tools ?? []);
    setInputText(input);
    setToolsText(toolList);
    setNodes(canvas.nodes);
    setEdges(canvas.edges);
    setSaved(
      pretty({
        name: next.name,
        language: next.language,
        voiceId: next.voice.voice_id,
        inputText: input,
        toolsText: toolList,
        graph: toApiGraph(canvas.nodes, canvas.edges),
      }),
    );
  }
  function payload() {
    const problems = graphProblems(graph);
    if (problems.length) throw new Error(problems.join("\n"));
    const input_schema = JSON.parse(inputText),
      toolList = JSON.parse(toolsText);
    if (!Array.isArray(toolList))
      throw new Error("Tools must be a JSON array.");
    if (
      config?.mode === "live" &&
      toolList.some((t) => t.request?.url?.includes(".example.com"))
    )
      throw new Error(
        "Replace the sample tool URL with your own HTTPS endpoint before saving.",
      );
    return {
      name,
      language,
      voice: { voice_id: voiceId, language },
      input_schema,
      tools: toolList,
      flow: graph,
      draft: agent?.draft ?? true,
    };
  }
  async function save() {
    const body = payload();
    await mirai("/agents/flow/validate", "POST", body.flow);
    const next = agent
      ? await mirai(`/agents/${agent.id}`, "PATCH", {
          ...body,
          if_revision: agent.revision,
        })
      : await mirai("/agents", "POST", body);
    accept(next);
    return next;
  }
  function patchNode(data) {
    setNodes((all) =>
      all.map((n) =>
        n.id === node.id ? { ...n, data: { ...n.data, ...data } } : n,
      ),
    );
  }
  function patchEdge(data) {
    setEdges((all) =>
      all.map((e) =>
        e.id === edge.id
          ? {
              ...e,
              data: { ...e.data, ...data },
              label: data.label ?? e.data.label,
            }
          : e,
      ),
    );
  }
  function addNode(type) {
    const id = `node_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
    setNodes((all) => [
      ...all,
      {
        id,
        type,
        position: { x: 250, y: 480 },
        data: {
          name: types[type],
          prompt: "Describe what this step should do.",
        },
      },
    ]);
    select({ kind: "node", id });
    setTab("Node");
  }
  function download() {
    const blob = new Blob([pretty(payload())], { type: "application/json" });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "mirai-agent.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function listAgents(cursor) {
    const page = await mirai(
      `/agents${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    setAgents((all) => (cursor ? [...all, ...page.data] : page.data));
    setAgentCursor(page.has_more ? page.next_cursor : null);
    return page;
  }
  async function listNumbers(cursor) {
    const page = await mirai(
      `/phone-numbers${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    setNumbers((all) => (cursor ? [...all, ...page.data] : page.data));
    setNumberCursor(page.has_more ? page.next_cursor : null);
    return page;
  }
  function updateNumber(next) {
    setNumbers((all) => all.map((n) => (n.id === next.id ? next : n)));
    return next;
  }
  async function dial(attempt) {
    const next = await mirai("/calls", "POST", attempt.body, attempt.key);
    setCallId(next.id);
    setPending(null);
    return next;
  }

  return (
    <div className="app">
      <header>
        <a
          className="brand"
          href="https://github.com/MiraiMinds/node-flow-builder"
        >
          mirai<span>/ flow builder</span>
        </a>
        <div className={`mode ${config?.mode === "live" ? "live" : ""}`}>
          {config?.mode === "live" ? "Live API" : "Demo · no calls placed"}
        </div>
        <a
          href="https://github.com/MiraiMinds/node-flow-builder/blob/main/docs/cookbook.md"
          target="_blank"
          rel="noreferrer"
        >
          Cookbook ↗
        </a>
      </header>
      <div className="workspace-bar">
        <div>
          <h1>{name || "Untitled agent"}</h1>
          <p>
            {agent
              ? `${agent.id} · Revision ${agent.revision} · ${agent.draft ? "Draft" : "Published"}`
              : "New flow agent"}
            {dirty ? " · Unsaved changes" : " · Saved"}
          </p>
        </div>
        <div className="actions">
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                download();
              }, "Exported agent JSON.")
            }
          >
            Export JSON
          </button>
          <button
            disabled={busy}
            onClick={() =>
              run(
                () => mirai("/agents/flow/validate", "POST", graph),
                "Graph validated. Saving also checks tool references and input declarations.",
              )
            }
          >
            Validate
          </button>
          <button
            className="primary"
            disabled={busy || !config}
            onClick={() =>
              run(save, "Agent saved. Review the returned revision below.")
            }
          >
            {busy ? "Working…" : agent ? "Save changes" : "Create draft"}
          </button>
        </div>
      </div>
      <main>
        <section className="canvas-area" aria-label="Flow editor">
          <div className="canvas-toolbar">
            <span>Add a step</span>
            {Object.entries(types).map(([type, label]) => (
              <button
                key={type}
                disabled={
                  busy ||
                  nodes.length >= 20 ||
                  (["startCall", "globalNode"].includes(type) &&
                    nodes.some((n) => n.type === type))
                }
                onClick={() => addNode(type)}
              >
                + {label}
              </button>
            ))}
          </div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={!busy}
            nodesConnectable={!busy}
            elementsSelectable={!busy}
            deleteKeyCode={busy ? null : ["Backspace", "Delete"]}
            onNodesChange={(changes) =>
              !busy && setNodes((all) => applyNodeChanges(changes, all))
            }
            onEdgesChange={(changes) =>
              !busy && setEdges((all) => applyEdgeChanges(changes, all))
            }
            onNodesDelete={(deleted) =>
              setEdges((all) =>
                all.filter(
                  (e) =>
                    !deleted.some(
                      (n) => n.id === e.source || n.id === e.target,
                    ),
                ),
              )
            }
            isValidConnection={(connection) =>
              !["endCall", "globalNode"].includes(
                nodes.find((n) => n.id === connection.source)?.type,
              ) &&
              nodes.find((n) => n.id === connection.target)?.type !==
                "globalNode"
            }
            onConnect={(connection) => {
              const id = `edge_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
              setEdges((all) => [
                ...all,
                {
                  id,
                  source: connection.source,
                  target: connection.target,
                  type: "smoothstep",
                  label: id,
                  data: {
                    label: id,
                    condition: "Describe when to move to the next step.",
                  },
                },
              ]);
              select({ kind: "edge", id });
              setTab("Node");
            }}
            onNodeClick={(_, n) => {
              select({ kind: "node", id: n.id });
              setTab("Node");
            }}
            onEdgeClick={(_, e) => {
              select({ kind: "edge", id: e.id });
              setTab("Node");
            }}
          >
            <Background color="#d7d9d2" gap={22} />
            <Controls />
          </ReactFlow>
          <div className="canvas-caption">
            Drag nodes to arrange them. Connect the handles to add a transition.
            Select a line to edit its condition.
          </div>
        </section>
        <aside>
          <nav aria-label="Editor panels">
            {["Node", "Agent", "Tools", "Variables", "Phone"].map((label) => (
              <button
                key={label}
                aria-pressed={tab === label}
                className={tab === label ? "active" : ""}
                onClick={() => setTab(label)}
              >
                {label}
              </button>
            ))}
          </nav>
          <fieldset disabled={busy} className="panel">
            {tab === "Node" && (
              <>
                <h2>
                  {node
                    ? types[node.type]
                    : edge
                      ? "Transition"
                      : "Select a node or line"}
                </h2>
                {node && (
                  <>
                    <p className="muted mono">{node.id}</p>
                    <Field label="Name">
                      <input
                        value={node.data.name}
                        maxLength={80}
                        onChange={(e) => patchNode({ name: e.target.value })}
                      />
                    </Field>
                    {node.type === "startCall" && (
                      <Field
                        label="Opening line"
                        hint="Use {{customer_name}} to read a call input."
                      >
                        <textarea
                          rows={3}
                          value={node.data.greeting || ""}
                          onChange={(e) =>
                            patchNode({ greeting: e.target.value })
                          }
                        />
                      </Field>
                    )}
                    <Field label="Instructions">
                      <textarea
                        rows={7}
                        value={node.data.prompt}
                        onChange={(e) => patchNode({ prompt: e.target.value })}
                      />
                    </Field>
                    {node.type !== "globalNode" && (
                      <>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={node.data.add_global_prompt !== false}
                            onChange={(e) =>
                              patchNode({ add_global_prompt: e.target.checked })
                            }
                          />
                          Include global instructions
                        </label>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={node.data.allow_interrupt !== false}
                            onChange={(e) =>
                              patchNode({ allow_interrupt: e.target.checked })
                            }
                          />
                          Allow interruption
                        </label>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={!!node.data.extraction_enabled}
                            onChange={(e) =>
                              patchNode({
                                extraction_enabled: e.target.checked,
                              })
                            }
                          />
                          Extract values when leaving this node
                        </label>
                        {node.data.extraction_enabled && (
                          <div className="extractions">
                            {(node.data.extraction_variables || []).map(
                              (variable, index) => {
                                const update = (change) =>
                                  patchNode({
                                    extraction_variables:
                                      node.data.extraction_variables.map(
                                        (v, i) =>
                                          i === index ? { ...v, ...change } : v,
                                      ),
                                  });
                                return (
                                  <div className="extraction" key={index}>
                                    <Field label="Variable name">
                                      <input
                                        value={variable.name}
                                        onChange={(e) =>
                                          update({ name: e.target.value })
                                        }
                                      />
                                    </Field>
                                    <Field label="Value type">
                                      <select
                                        value={variable.type}
                                        onChange={(e) =>
                                          update({ type: e.target.value })
                                        }
                                      >
                                        {["string", "number", "boolean"].map(
                                          (t) => (
                                            <option key={t}>{t}</option>
                                          ),
                                        )}
                                      </select>
                                    </Field>
                                    <Field label="What to extract">
                                      <textarea
                                        rows={2}
                                        value={variable.prompt}
                                        onChange={(e) =>
                                          update({ prompt: e.target.value })
                                        }
                                      />
                                    </Field>
                                    <button
                                      onClick={() =>
                                        patchNode({
                                          extraction_variables:
                                            node.data.extraction_variables.filter(
                                              (_, i) => i !== index,
                                            ),
                                        })
                                      }
                                    >
                                      Remove value
                                    </button>
                                  </div>
                                );
                              },
                            )}
                            <button
                              onClick={() =>
                                patchNode({
                                  extraction_variables: [
                                    ...(node.data.extraction_variables || []),
                                    {
                                      name: `value_${(node.data.extraction_variables || []).length + 1}`,
                                      type: "string",
                                      prompt: "Describe the fact to extract.",
                                    },
                                  ],
                                })
                              }
                            >
                              + Extraction value
                            </button>
                          </div>
                        )}
                      </>
                    )}
                    {["startCall", "agentNode"].includes(node.type) && (
                      <div className="tool-selection">
                        <h3>Tools on this node</h3>
                        {tools
                          .filter((t) => t.phase === "on_call")
                          .map((tool) => (
                            <label className="check" key={tool.name}>
                              <input
                                type="checkbox"
                                checked={
                                  node.data.tools?.includes(tool.name) || false
                                }
                                onChange={(e) =>
                                  patchNode({
                                    tools: e.target.checked
                                      ? [
                                          ...new Set([
                                            ...(node.data.tools || []),
                                            tool.name,
                                          ]),
                                        ]
                                      : (node.data.tools || []).filter(
                                          (name) => name !== tool.name,
                                        ),
                                  })
                                }
                              />
                              {tool.name}
                              {tool.enabled === false ? " (disabled)" : ""}
                            </label>
                          ))}
                        {!tools.some((t) => t.phase === "on_call") && (
                          <p className="muted">
                            Add a definition in Tools, then choose it here.
                          </p>
                        )}
                      </div>
                    )}
                    <button
                      className="danger"
                      onClick={() => {
                        setNodes((all) => all.filter((n) => n.id !== node.id));
                        setEdges((all) =>
                          all.filter(
                            (e) => e.source !== node.id && e.target !== node.id,
                          ),
                        );
                        select(null);
                      }}
                    >
                      Delete node
                    </button>
                  </>
                )}
                {edge && (
                  <>
                    <p className="muted mono">
                      {edge.source} → {edge.target}
                    </p>
                    <Field
                      label="Function label"
                      hint="Use a unique function name for each outgoing transition."
                    >
                      <input
                        value={edge.data.label}
                        onChange={(e) => patchEdge({ label: e.target.value })}
                      />
                    </Field>
                    <Field label="When to take this transition">
                      <textarea
                        rows={6}
                        value={edge.data.condition}
                        onChange={(e) =>
                          patchEdge({ condition: e.target.value })
                        }
                      />
                    </Field>
                    <button
                      className="danger"
                      onClick={() => {
                        setEdges((all) => all.filter((e) => e.id !== edge.id));
                        select(null);
                      }}
                    >
                      Delete transition
                    </button>
                  </>
                )}
              </>
            )}
            {tab === "Agent" && (
              <>
                <h2>Agent settings</h2>
                <Field label="Agent name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label="Language">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                  </select>
                </Field>
                <Field label="Voice ID">
                  <input
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                  />
                </Field>
                <button
                  onClick={() =>
                    run(() => mirai("/voices"), "Voice catalogue loaded below.")
                  }
                >
                  View voices
                </button>
                <div className="section">
                  <h3>Publish for phone calls</h3>
                  <p>
                    New agents are drafts. Publish after saving. Changes to a
                    published agent affect new direct calls as soon as you save.
                  </p>
                  <button
                    disabled={!agent || dirty || !agent.draft}
                    onClick={() =>
                      run(async () => {
                        const next = await mirai(
                          `/agents/${agent.id}/publish`,
                          "POST",
                          { if_revision: agent.revision },
                        );
                        accept(next);
                        return next;
                      }, "Agent published.")
                    }
                  >
                    Publish saved draft
                  </button>
                </div>
                <div className="section">
                  <h3>Open an existing flow</h3>
                  <button onClick={() => run(() => listAgents())}>
                    List agents
                  </button>
                  {agentCursor && (
                    <button onClick={() => run(() => listAgents(agentCursor))}>
                      Load more
                    </button>
                  )}
                  <Field label="Agent">
                    <select
                      value={loadId}
                      onChange={(e) => setLoadId(e.target.value)}
                    >
                      <option value="">Choose an agent</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Or paste an agent ID">
                    <input
                      value={loadId}
                      onChange={(e) => setLoadId(e.target.value)}
                    />
                  </Field>
                  <button
                    disabled={!loadId}
                    onClick={() => {
                      if (
                        dirty &&
                        !confirm(
                          "Replace the unsaved editor contents with this agent?",
                        )
                      )
                        return;
                      run(async () => {
                        const next = await mirai(
                          `/agents/${encodeURIComponent(loadId)}`,
                        );
                        if (!next.flow)
                          throw new Error(
                            "This is a prompt agent. Choose a node-based agent.",
                          );
                        accept(next);
                        select(null);
                        return next;
                      }, "Saved flow loaded.");
                    }}
                  >
                    Load agent
                  </button>
                </div>
              </>
            )}
            {tab === "Tools" && (
              <>
                <h2>Tool definitions</h2>
                <p>
                  Define tools on the agent, then select each on-call tool on
                  the nodes that need it. Saves send the complete list.
                </p>
                <button
                  onClick={() => {
                    try {
                      const current = JSON.parse(toolsText);
                      if (!Array.isArray(current))
                        throw new Error("Tools must be a JSON array.");
                      if (current.some((t) => t.name === exampleTool.name)) {
                        throw new Error("lookup_order is already in the list.");
                      }
                      setToolsText(pretty([...current, exampleTool]));
                      setError("");
                    } catch (error) {
                      setError(
                        `Fix the existing tools JSON before adding a sample. ${error.message}`,
                      );
                    }
                  }}
                >
                  + Order lookup example
                </button>
                <JsonField
                  label="Agent tools"
                  value={toolsText}
                  setValue={setToolsText}
                  hint="Use your own HTTPS endpoint. Use {{secrets.name}} for credentials; never paste a token here."
                />
                <p className="muted">
                  The sample URL must be replaced before saving in live mode.
                  End nodes end the call; do not add an end_call tool.
                </p>
              </>
            )}
            {tab === "Variables" && (
              <>
                <h2>Inputs and extraction</h2>
                <p>
                  Declare inputs your application knows before the call. Collect
                  facts said by the caller using each node's extraction
                  settings.
                </p>
                <JsonField
                  label="Input schema"
                  value={inputText}
                  setValue={setInputText}
                />
                <JsonField
                  label="Values for the next call"
                  value={variablesText}
                  setValue={setVariablesText}
                  hint="These values are sent per call. They do not change the agent."
                />
                <button
                  disabled={!agent || dirty}
                  onClick={() =>
                    run(
                      () =>
                        mirai(`/agents/${agent.id}/preview`, "POST", {
                          variables: JSON.parse(variablesText),
                        }),
                      "Saved agent inputs checked. Preview does not run a conversation.",
                    )
                  }
                >
                  Preview saved inputs
                </button>
              </>
            )}
            {tab === "Phone" && (
              <>
                <h2>Connect a phone number</h2>
                <p>
                  Use a number already imported into your workspace. The
                  cookbook covers provider setup and importing a number.
                </p>
                <button onClick={() => run(() => listNumbers())}>
                  Load numbers
                </button>
                {numberCursor && (
                  <button onClick={() => run(() => listNumbers(numberCursor))}>
                    Load more
                  </button>
                )}
                <Field label="Workspace number">
                  <select
                    value={numberId}
                    onChange={(e) => setNumberId(e.target.value)}
                  >
                    <option value="">Choose a number</option>
                    {numbers.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.number} · {n.state}
                      </option>
                    ))}
                  </select>
                </Field>
                {number && (
                  <>
                    <p className="muted mono">
                      {number.id} · v{number.version}
                      <br />
                      Inbound agent: {number.agent_id || "None"}
                    </p>
                    <button
                      disabled={!agent || agent.draft || dirty}
                      onClick={() => {
                        if (
                          !confirm(
                            `Assign ${number.number} to ${agent.name} for incoming calls?`,
                          )
                        )
                          return;
                        run(
                          async () =>
                            updateNumber(
                              await mirai(
                                `/phone-numbers/${number.id}`,
                                "PATCH",
                                { version: number.version, agent_id: agent.id },
                              ),
                            ),
                          "Inbound agent assigned.",
                        );
                      }}
                    >
                      Assign inbound agent
                    </button>
                    <button
                      disabled={
                        number.state === "ready" &&
                        number.connection_state === "verified"
                      }
                      onClick={() => {
                        if (
                          !confirm(
                            "Activate this number? This configures its provider voice application. Existing applications will not be replaced.",
                          )
                        )
                          return;
                        run(
                          async () =>
                            updateNumber(
                              await mirai(
                                `/phone-numbers/${number.id}/activate`,
                                "POST",
                                {
                                  version: number.version,
                                  replace_existing_application: false,
                                },
                              ),
                            ),
                          "Number activated.",
                        );
                      }}
                    >
                      Activate number
                    </button>
                  </>
                )}
                <div className="section">
                  <h3>Place an outbound call</h3>
                  <Field label="Destination in E.164 format">
                    <input
                      type="tel"
                      placeholder="+91…"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </Field>
                  <p className="muted">
                    Uses the values in Variables and the saved agent revision.{" "}
                    {config?.mode === "live"
                      ? "This rings a real phone and uses your wallet."
                      : "Demo mode returns a fixture; it never dials."}
                  </p>
                  <button
                    className="primary"
                    disabled={
                      !agent ||
                      agent.draft ||
                      dirty ||
                      !number ||
                      number.state !== "ready" ||
                      number.connection_state !== "verified" ||
                      !!pending
                    }
                    onClick={() =>
                      run(async () => {
                        if (!/^\+[1-9]\d{7,14}$/.test(to))
                          throw new Error(
                            "Enter a destination in E.164 format.",
                          );
                        const body = {
                          agent_id: agent.id,
                          agent_revision: agent.revision,
                          phone_number_id: number.id,
                          channel: "phone",
                          to,
                          variables: JSON.parse(variablesText),
                          max_duration_secs: 120,
                          recording_enabled: false,
                          final_results: true,
                        };
                        if (
                          !confirm(
                            `${config?.mode === "live" ? "Place a real, billable call" : "Create a demo call"} to ${to}?`,
                          )
                        )
                          return;
                        const attempt = { key: crypto.randomUUID(), body };
                        sessionStorage.setItem(
                          "mirai-pending-call",
                          JSON.stringify(attempt),
                        );
                        setPending(attempt);
                        return dial(attempt);
                      })
                    }
                  >
                    Call this number
                  </button>
                  {pending && (
                    <div className="call-pending">
                      <p>
                        A call request has no confirmed response. Retrying uses
                        the same body and key.
                      </p>
                      <code>{pending.key}</code>
                      <button onClick={() => run(() => dial(pending))}>
                        Retry the same request
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              "Only clear this after checking call history in the console. A new call could otherwise dial twice.",
                            )
                          )
                            setPending(null);
                        }}
                      >
                        Clear after checking history
                      </button>
                    </div>
                  )}
                  <Field label="Call ID">
                    <input
                      value={callId}
                      onChange={(e) => setCallId(e.target.value)}
                    />
                  </Field>
                  <button
                    disabled={!callId}
                    onClick={() =>
                      run(
                        () => mirai(`/calls/${encodeURIComponent(callId)}`),
                        "Call status and available results loaded.",
                      )
                    }
                  >
                    Refresh call
                  </button>
                  <button
                    disabled={!callId}
                    onClick={() =>
                      run(
                        () =>
                          mirai(
                            `/calls/${encodeURIComponent(callId)}/tool_runs`,
                          ),
                        "Tool receipts loaded.",
                      )
                    }
                  >
                    View tool runs
                  </button>
                </div>
              </>
            )}
          </fieldset>
        </aside>
      </main>
      <footer>
        <div role="status" className="status">
          {busy ? "Waiting for the API…" : notice}
        </div>
        {error && (
          <pre role="alert" className="error">
            {error}
            {error.includes("conflict")
              ? "\nYour edits are still here. Export them before reloading the agent."
              : ""}
          </pre>
        )}
        <details open={!!error}>
          <summary>
            API response{config?.mode === "demo" ? " · demo fixture" : ""}
          </summary>
          <pre>
            {result ? pretty(result) : "Responses appear here after an action."}
          </pre>
        </details>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
