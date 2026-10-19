import type { LiteralValue } from "@blockml/bom";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isIdentifier(raw: string): boolean {
  return IDENTIFIER.test(raw.trim());
}

export function scadString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Customizer JSON stores every value as a string. Strings stay unquoted. */
export function presetParameterValue(value: LiteralValue): string | undefined {
  const raw = value.value;
  if (typeof raw === "string") {
    return raw;
  }
  if (typeof raw === "boolean" || typeof raw === "number") {
    return String(raw);
  }
  if (isSizeXYZ(raw)) {
    return `[${raw.x}, ${raw.y}, ${raw.z}]`;
  }
  return undefined;
}

export function serializeLiteral(value: LiteralValue): string | undefined {
  const raw = value.value;
  if (typeof raw === "boolean" || typeof raw === "number") {
    return String(raw);
  }
  if (typeof raw === "string") {
    return scadString(raw);
  }
  if (isSizeXYZ(raw)) {
    return `[${raw.x}, ${raw.y}, ${raw.z}]`;
  }
  return undefined;
}

function isSizeXYZ(value: unknown): value is { x: number; y: number; z: number } {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.x === "number" && typeof record.y === "number" && typeof record.z === "number";
}
