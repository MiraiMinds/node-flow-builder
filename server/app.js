import express from "express";
import { createMiraiClient, ApiError } from "./mirai.js";
import { createDemoClient } from "./demo.js";

// Fixed operations, never an arbitrary URL proxy. Keep provider provisioning server-side.
const routes = [
  ["GET", /^\/v2\/(voices|agents|phone-numbers)$/],
  ["POST", /^\/v2\/agents$/],
  ["POST", /^\/v2\/agents\/flow\/validate$/],
  ["GET", /^\/v2\/agents\/[\w-]+$/],
  ["PATCH", /^\/v2\/agents\/[\w-]+$/],
  ["POST", /^\/v2\/agents\/[\w-]+\/(preview|publish)$/],
  ["GET", /^\/v2\/phone-numbers\/[\w-]+$/],
  ["PATCH", /^\/v2\/phone-numbers\/[\w-]+$/],
  ["POST", /^\/v2\/phone-numbers\/[\w-]+\/activate$/],
  ["POST", /^\/v2\/calls$/],
  ["GET", /^\/v2\/calls\/[\w-]+(?:\/tool_runs)?$/],
];

export function createApp({
  mode = "demo",
  baseUrl = "https://sandbox.voice.miraiminds.co",
  apiKey,
  client,
} = {}) {
  if (!["demo", "live"].includes(mode))
    throw new Error("MIRAI_MODE must be demo or live.");
  const mirai =
    client ||
    (mode === "demo"
      ? createDemoClient()
      : createMiraiClient({ baseUrl, apiKey }));
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    // Loopback Host + same-origin requests also protect a local key from DNS rebinding.
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || ""))
      return res
        .status(403)
        .json({
          error: { message: "This example accepts localhost requests only." },
        });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const origin = req.headers.origin;
    if (
      (origin && origin !== `http://${req.headers.host}`) ||
      req.headers["x-example-client"] !== "flow-builder"
    ) {
      return res
        .status(403)
        .json({
          error: { message: "Use the local example app to access this API." },
        });
    }
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/config", (_req, res) =>
    res.json({ mode, baseUrl: mode === "demo" ? null : baseUrl }),
  );
  app.use("/api/mirai", async (req, res, next) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (
        !routes.some(
          ([method, pattern]) =>
            method === req.method && pattern.test(url.pathname),
        )
      ) {
        return res
          .status(404)
          .json({
            error: { message: "Operation not exposed by this example." },
          });
      }
      for (const name of url.searchParams.keys())
        if (!["cursor", "limit"].includes(name)) {
          return res
            .status(400)
            .json({ error: { message: "Unsupported query parameter." } });
        }
      if (
        req.method !== "GET" &&
        (!req.is("application/json") || !req.body || Array.isArray(req.body))
      ) {
        return res
          .status(400)
          .json({ error: { message: "Send a JSON object." } });
      }
      const isCall = req.method === "POST" && url.pathname === "/v2/calls";
      const key = req.headers["idempotency-key"];
      if (isCall && (typeof key !== "string" || !/^[\w-]{8,128}$/.test(key))) {
        return res
          .status(400)
          .json({
            error: {
              message:
                "A call requires an Idempotency-Key (8–128 letters, digits, hyphens or underscores).",
            },
          });
      }
      const result = await mirai(
        req.method,
        url.pathname + url.search,
        req.method === "GET" ? undefined : req.body,
        isCall ? key : undefined,
      );
      for (const [name, value] of Object.entries(result.headers || {}))
        res.setHeader(name, value);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: { message: "Unknown example API route." } }),
  );
  app.use((error, _req, res, _next) => {
    if (error instanceof ApiError) {
      for (const [name, value] of Object.entries(error.headers))
        res.setHeader(name, value);
      return res.status(error.status).json(error.body);
    }
    res
      .status(error.status === 413 ? 413 : 400)
      .json({
        error: {
          message:
            "The request could not be read. Check the JSON and keep it below 1 MB.",
        },
      });
  });
  return app;
}
