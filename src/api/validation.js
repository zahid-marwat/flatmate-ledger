import { ApiError } from "./errors.js";

export function requireString(value, fieldName, { minLength = 1, allowEmpty = false } = {}) {
  if (typeof value !== "string") {
    throw new ApiError(400, `${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (!allowEmpty && trimmed.length < minLength) {
    throw new ApiError(400, `${fieldName} is required`);
  }
  return trimmed;
}

export function optionalString(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new ApiError(400, "Expected a string");
  return value.trim();
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

