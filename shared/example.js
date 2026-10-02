// These are public API fields, independent of the canvas library.
export const example = {
  name: "Delivery check-in",
  language: "en",
  voice: { voice_id: "neha", language: "en" },
  draft: true,
  input_schema: {
    type: "object",
    properties: {
      customer_name: { type: "string", default: "there" },
      order_id: { type: "string", default: "" },
    },
    additionalProperties: false,
  },
  tools: [],
  flow: {
    nodes: [
      {
        id: "rules",
        type: "globalNode",
        position: { x: 30, y: 20 },
        data: {
          name: "Conversation rules",
          prompt:
            "You help with deliveries. Be brief. Ask one question at a time. Never invent an order status. If no order number is available, ask for it.",
        },
      },
      {
        id: "hello",
        type: "startCall",
        position: { x: 30, y: 240 },
        data: {
          name: "Say hello",
          greeting:
            "Hello {{customer_name}}, how can I help with your delivery?",
          prompt:
            "Find out whether the caller wants an order update or needs no help. The supplied order number is {{order_id}}.",
        },
      },
      {
        id: "delivery",
        type: "agentNode",
        position: { x: 400, y: 190 },
        data: {
          name: "Check the delivery",
          prompt:
            "Confirm the order number. If lookup_order is available, use it and explain the returned status. Otherwise explain that an order lookup is not configured. Ask whether the caller needs anything else.",
          extraction_enabled: true,
          extraction_variables: [
            {
              name: "needs_follow_up",
              type: "boolean",
              prompt: "True if the delivery question remains unresolved.",
            },
          ],
          tools: [],
        },
      },
      {
        id: "goodbye",
        type: "endCall",
        position: { x: 780, y: 240 },
        data: {
          name: "Finish the call",
          prompt: "Thank the caller and say goodbye in one short sentence.",
        },
      },
    ],
    edges: [
      {
        id: "needs_help",
        source: "hello",
        target: "delivery",
        data: {
          label: "check_delivery",
          condition: "The caller wants help with a delivery.",
        },
      },
      {
        id: "no_help",
        source: "hello",
        target: "goodbye",
        data: {
          label: "finish_greeting",
          condition: "The caller needs no help or wants to end the call.",
        },
      },
      {
        id: "resolved",
        source: "delivery",
        target: "goodbye",
        data: {
          label: "finish_delivery",
          condition:
            "The question has been answered, a follow-up is needed, or the caller wants to end the call.",
        },
      },
    ],
  },
};

export const exampleVariables = { customer_name: "Sam", order_id: "DEMO-1042" };

// Replace the example URL with your publicly reachable HTTPS endpoint before use.
export const exampleTool = {
  name: "lookup_order",
  phase: "on_call",
  kind: "http",
  enabled: true,
  description: "Look up the current delivery status of an order.",
  when: "Use after the caller has provided or confirmed the order number.",
  parameters: {
    type: "object",
    properties: { order_id: { type: "string" } },
    required: ["order_id"],
  },
  speak_while: "Let me check that order.",
  request: {
    method: "POST",
    url: "https://your-api.example.com/tools/lookup-order",
    body: { order_id: "{{ args.order_id }}" },
  },
  response: { strict: true },
  timeout_ms: 10000,
  on_failure: "continue",
};
