import express from "express";
import { timingSafeEqual } from "node:crypto";

// Run separately from the editor. Only expose this service through your HTTPS tunnel.
// Replace this fixture lookup with your own order database before serving customers.
export function createToolService(secret) {
  if (!secret || secret.length < 24)
    throw new Error("Set TOOL_SHARED_SECRET to at least 24 random characters.");
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "8kb" }));
  app.post("/tools/lookup-order", (req, res) => {
    const received = Buffer.from(req.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      return res.status(401).json({ error: "unauthorized" });
    if (typeof req.body?.order_id !== "string")
      return res.status(400).json({ error: "order_id is required" });
    res.setHeader("Cache-Control", "no-store");
    if (req.body.order_id !== "DEMO-1042")
      return res.json({
        found: false,
        message: "No order found. Ask the caller to check the order number.",
      });
    res.json({
      found: true,
      order_id: "DEMO-1042",
      status: "out_for_delivery",
      estimated_delivery: "Today before 6 pm",
      sample_data: true,
    });
  });
  return app;
}
