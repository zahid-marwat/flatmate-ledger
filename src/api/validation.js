import { ApiError } from "./errors.js";

export function assertAllowedFields(value, allowedFields, label = "request body") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, `${label} must be an object`);
  }

  const allowed = new Set(allowedFields);
  const unknown = Object.keys(value).filter((field) => !allowed.has(field));
  if (unknown.length) {
    throw new ApiError(400, `Unexpected field${unknown.length > 1 ? "s" : ""} in ${label}: ${unknown.join(", ")}`);
  }
  return value;
}

export function requireString(value, fieldName, { minLength = 1, maxLength = 255, allowEmpty = false, pattern = null } = {}) {
  if (typeof value !== "string") {
    throw new ApiError(400, `${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (!allowEmpty && trimmed.length < minLength) {
    throw new ApiError(400, `${fieldName} is required`);
  }
  if (trimmed.length > maxLength) {
    throw new ApiError(400, `${fieldName} must be ${maxLength} characters or fewer`);
  }
  if (pattern && trimmed && !pattern.test(trimmed)) {
    throw new ApiError(400, `${fieldName} has an invalid format`);
  }
  return trimmed;
}

export function optionalString(value, fieldName = "field", { maxLength = 255, pattern = null } = {}) {
  if (value == null || value === "") return null;
  return requireString(value, fieldName, { minLength: 0, maxLength, allowEmpty: true, pattern });
}

export function requireInteger(value, fieldName, { min = 1 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min) {
    throw new ApiError(400, `${fieldName} must be an integer >= ${min}`);
  }
  return number;
}

export function requireOneOf(value, fieldName, allowedValues) {
  if (!allowedValues.includes(value)) {
    throw new ApiError(400, `${fieldName} must be one of: ${allowedValues.join(", ")}`);
  }
  return value;
}

export function requireArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new ApiError(400, `${fieldName} must be an array`);
  }
  return value;
}

export function optionalArray(value, fieldName) {
  if (value === undefined || value === null) return [];
  return requireArray(value, fieldName);
}

export function requireUsername(value, fieldName = "username") {
  return requireString(value, fieldName, {
    minLength: 3,
    maxLength: 32,
    pattern: /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/i,
  }).toLowerCase();
}

export function optionalUsername(value, fieldName = "username") {
  if (value == null || value === "") return null;
  return requireUsername(value, fieldName);
}

export function requireDateString(value, fieldName) {
  const text = requireString(value, fieldName, { maxLength: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ });
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new ApiError(400, `${fieldName} must be a valid date in YYYY-MM-DD format`);
  }
  return text;
}

export function optionalDateString(value, fieldName) {
  if (value == null || value === "") return null;
  return requireDateString(value, fieldName);
}
