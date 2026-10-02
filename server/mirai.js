export class ApiError extends Error {
  constructor(status, body, headers = {}) {
    const err = body?.error;
    super(
      typeof err === "string"
        ? err
        : err?.message || `Mirai returned HTTP ${status}`,
    );
    this.status = status;
    this.body = body;
    this.headers = headers;
  }
}

export function createMiraiClient({ baseUrl, apiKey, fetchImpl = fetch }) {
  const origin = new URL(baseUrl);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(
      "MIRAI_BASE_URL must be an HTTPS origin with no credentials, path, or query.",
    );
  }
  if (!apiKey?.trim())
    throw new Error("Set MIRAI_API_KEY before starting in live mode.");
  return async function mirai(method, path, body, idempotencyKey) {
    if (!path.startsWith("/v2/"))
      throw new Error("Expected a public /v2/ path.");
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    let response;
    try {
      response = await fetchImpl(new URL(path, origin), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
        redirect: "error",
      });
    } catch {
      // A write may have reached Mirai. Never automatically retry it.
      throw new ApiError(502, {
        error: {
          code: "upstream_unreachable",
          message:
            "No response from Mirai. A write may have succeeded. Reload the resource before saving again; retry a call only with the same idempotency key.",
        },
      });
    }
    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      throw new ApiError(502, {
        error: {
          code: "invalid_upstream_response",
          message: "Mirai returned a non-JSON response. Check your API host.",
        },
      });
    }
    const forwarded = {};
    for (const name of ["retry-after", "x-request-id"])
      if (response.headers.has(name))
        forwarded[name] = response.headers.get(name);
    if (!response.ok) throw new ApiError(response.status, data, forwarded);
    return { status: response.status, body: data, headers: forwarded };
  };
}
