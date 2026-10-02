import express from "express";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const mode = process.env.MIRAI_MODE || "demo";
const app = createApp({
  mode,
  apiKey: process.env.MIRAI_API_KEY,
  baseUrl: process.env.MIRAI_BASE_URL || "https://sandbox.voice.miraiminds.co",
});
if (process.argv.includes("--production")) {
  const dist = fileURLToPath(new URL("../dist/", import.meta.url));
  app.use(express.static(dist));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
app.listen(port, "127.0.0.1", () =>
  console.log(`Mirai Flow Builder: http://localhost:${port} (${mode} mode)`),
);
