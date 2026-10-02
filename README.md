# Mirai node flow builder

A small Node.js app for building a voice agent as a graph on your own platform.
The React Flow canvas edits the same public graph format the Mirai API accepts.
An Express server keeps your workspace key out of the browser.

[Read the cookbook](docs/cookbook.md) for the API requests and integration details.

## Run it

Use Node.js 22.19 or later.

```bash
git clone https://github.com/MiraiMinds/node-flow-builder.git
cd node-flow-builder
npm ci
cp .env.example .env
npm run dev
```

Open **http://localhost:3000**. The app starts in **demo mode**. It keeps sample
agents in memory, resets them when the server restarts, and never calls Mirai,
executes a tool, runs speech, or rings a phone. Demo validation checks a subset
of graph rules; the real API validates the complete agent.

To use your workspace, edit `.env`, then restart:

```dotenv
MIRAI_MODE=live
MIRAI_API_KEY=your_workspace_key
MIRAI_BASE_URL=https://sandbox.voice.miraiminds.co
```

Use the host your key was issued for. Keep `.env` out of Git. There are no
`VITE_` secrets; the browser gets only the mode and API host.

## Try the full flow

1. Edit a node or transition on the canvas. Add, connect, move, or delete steps.
2. In **Tools**, add the order lookup definition. In live mode, replace its
   sample URL with your own HTTPS endpoint. Select `lookup_order` on the
   **Check the delivery** node.
3. In **Variables**, review the input schema and per-call values. Use a node's
   extraction settings for values the caller will tell you.
4. Click **Create draft**. After another edit, **Save changes** updates that
   same agent using its revision. **Agent → Load agent** opens an existing flow.
5. Click **Agent → Publish saved draft**. Publishing makes the agent eligible
   for ordinary calls. Saving later edits to a published agent changes what
   new direct calls use; there is no second published branch behind a draft.
6. In **Phone**, load a workspace number. Assign it for inbound calls, activate
   it if needed, or call a destination from it. Live calls are billable and
   require an active number and wallet credit. The sample disables recording.
7. Use **Refresh call** and **View tool runs** to inspect the result. These are
   manual refreshes; there is no background polling or live audio in this app.

**Validate** checks the graph without saving. The agent save also checks input
declarations and tool references. **Preview saved inputs** validates call inputs;
it does not execute a conversation. **Export JSON** downloads the editable agent
definition so you can keep local work before resolving a revision conflict.

## Run the sample HTTP tool

The optional service returns one explicitly fictional order, `DEMO-1042`.
Replace its lookup with your own database before using it with customers.

```bash
# Generate a value, then put it in TOOL_SHARED_SECRET in .env.
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm run tools
```

Expose **only port 3001** through an HTTPS endpoint on port 443. See the cookbook
for saving the matching secret in Mirai and referencing it from the tool header.
The editor and its credentialed API proxy stay on localhost:3000.

## Files to adapt

| File                     | Purpose                                                   |
| ------------------------ | --------------------------------------------------------- |
| `shared/example.js`      | Agent, graph, input schema, and tool examples             |
| `shared/graph.js`        | Canvas serialization and basic graph checks               |
| `src/main.jsx`           | Node editor and agent, tools, variables, and phone panels |
| `server/app.js`          | Local API allowlist and same-origin guard                 |
| `server/mirai.js`        | Authenticated Mirai requests and error handling           |
| `server/demo.js`         | Offline fixtures, with no network access                  |
| `server/tool-service.js` | Separate authenticated example order endpoint             |

## Checks and production build

```bash
npm run check
npm run build
npm start
```

Tests cover graph serialization, reachability, stale revisions, API errors,
credential isolation, request restrictions, call idempotency, the demo lifecycle,
and tool authentication. A DOM-based smoke test exercises the built UI through
the full demo workflow. These checks do not place a real call or verify visual
layout in a browser.

## Embed it in your platform

This is a **local, single-workspace reference app**. It binds to loopback and
rejects non-local Host headers. Before hosting it, replace that boundary with
your platform's authenticated sessions, CSRF protection, tenant ownership
checks, and rate limits. Resolve each workspace's key on the server; never let
a browser choose an arbitrary workspace key or API origin.

Store drafts in your database if users need to resume them. The example does
not autosave. An unresolved call attempt is kept in tab-scoped `sessionStorage`
with its phone number, inputs, and idempotency key, so a retry after a reload
can use the same request. Successful calls clear it. In production, keep this
record on your server with your retention policy and show call history before
allowing another attempt. Call keys must stay scoped to the same workspace.

Provider setup, number rental, browser audio, webhook reception, authentication,
and a customer database are outside this small app. The cookbook covers the
provider import API and links to the audio and webhook guides.
