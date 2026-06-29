import { ApiError } from "./errors.js";

export async function readJson(request) {
  const text = await request.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "Invalid JSON payload");
  }
}

export function readBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export function requireObject(value, message = "Request body must be an object") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, message);
  }
  return value;
}

