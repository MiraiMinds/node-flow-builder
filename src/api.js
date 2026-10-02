export async function request(
  path,
  { method = "GET", body, idempotencyKey } = {},
) {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Example-Client": "flow-builder",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const message =
      typeof data.error === "string"
        ? data.error
        : data.error?.message || `HTTP ${response.status}`;
    const detail = (data.details || [])
      .map((item) => `${item.path}: ${item.message}`)
      .join("\n");
    const error = new Error([message, detail].filter(Boolean).join("\n"));
    Object.assign(error, { status: response.status, body: data });
    throw error;
  }
  return data;
}
export const mirai = (path, method = "GET", body, idempotencyKey) =>
  request(`/api/mirai/v2${path}`, { method, body, idempotencyKey });
