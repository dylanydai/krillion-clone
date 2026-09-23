export class ClientError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "ClientError";
    this.code = code;
  }
}

export async function api<T>(path: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(45_000);
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]) });
  const value: unknown = await response.json();
  if (!response.ok) {
    if (typeof value === "object" && value !== null && "error" in value && typeof value.error === "object" && value.error !== null && "message" in value.error && typeof value.error.message === "string" && "code" in value.error && typeof value.error.code === "string") {
      throw new ClientError(value.error.message, value.error.code);
    }
    throw new ClientError(`The server returned HTTP ${response.status}.`, "SERVER_ERROR");
  }
  return value as T;
}
