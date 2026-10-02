// Executes the built UI in a DOM emulator against the demo HTTP server.
// Covers user actions; it does not claim visual or real-browser coverage.
import assert from "node:assert/strict";
import { once } from "node:events";
import { readdir } from "node:fs/promises";
import { Window } from "happy-dom";
import { createApp } from "../server/app.js";

const server = createApp().listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const window = new Window({ url: base });
const nativeFetch = globalThis.fetch;
try {
  for (const name of [
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "MutationObserver",
    "ResizeObserver",
    "DOMMatrixReadOnly",
  ]) {
    Object.defineProperty(globalThis, name, {
      value: window[name],
      configurable: true,
    });
  }
  globalThis.window = window;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.sessionStorage = window.sessionStorage;
  globalThis.confirm = () => true;
  globalThis.fetch = (path, options) =>
    nativeFetch(new URL(path, base), options);
  window.document.body.innerHTML = '<div id="root"></div>';
  const file = (
    await readdir(new URL("../dist/assets/", import.meta.url))
  ).find((name) => /^index-.*\.js$/.test(name));
  await import(new URL(`../dist/assets/${file}`, import.meta.url));
  const waitFor = async (check) => {
    for (let i = 0; i < 150; i++) {
      if (check()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(
      `UI condition timed out. ${window.document.body.textContent}`,
    );
  };
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (el) => el.textContent === text,
    );
  const click = async (text) => {
    await waitFor(
      () =>
        button(text) &&
        !button(text).disabled &&
        !button(text).closest("fieldset[disabled]"),
    );
    button(text).click();
    await new Promise((resolve) => setTimeout(resolve, 30));
  };
  const field = (text) =>
    [...document.querySelectorAll("label.field")]
      .find((el) => el.querySelector("span")?.textContent === text)
      ?.querySelector("input,select,textarea");
  const setField = async (text, value) => {
    const el = field(text);
    assert.ok(el, `Missing field: ${text}`);
    const proto =
      el.tagName === "SELECT"
        ? window.HTMLSelectElement.prototype
        : el.tagName === "TEXTAREA"
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(
      new window.Event(el.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
  };

  await click("Create draft");
  await waitFor(() => document.body.textContent.includes("Revision 1"));
  await click("Tools");
  await click("+ Order lookup example");
  await click("Node");
  await waitFor(() =>
    [...document.querySelectorAll("label.check")].some(
      (el) => el.textContent === "lookup_order",
    ),
  );
  [...document.querySelectorAll("label.check")]
    .find((el) => el.textContent === "lookup_order")
    .querySelector("input")
    .click();
  await click("Save changes");
  await waitFor(() => document.body.textContent.includes("Revision 2"));
  await click("Variables");
  await click("Preview saved inputs");
  await waitFor(() =>
    document.body.textContent.includes("Saved agent inputs checked"),
  );
  await click("Agent");
  await click("Publish saved draft");
  await waitFor(() =>
    document.body.textContent.includes("Revision 3 · Published"),
  );
  await click("Phone");
  await click("Load numbers");
  await setField("Workspace number", "pn_demo");
  await click("Assign inbound agent");
  await waitFor(() =>
    document.body.textContent.includes("Inbound agent assigned"),
  );
  await setField("Destination in E.164 format", "+12025550101");
  await click("Call this number");
  await waitFor(() => field("Call ID")?.value.startsWith("call_"));
  await click("Refresh call");
  await waitFor(() =>
    document.body.textContent.includes("Demo only: no conversation ran"),
  );
  assert.equal(sessionStorage.getItem("mirai-pending-call"), null);
  assert.equal(document.querySelector('[role="alert"]'), null);
  console.log(
    "PASS built UI: create, tools, save, inputs, publish, assign phone, call, results",
  );
} finally {
  globalThis.fetch = nativeFetch;
  await window.happyDOM.close();
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
}
