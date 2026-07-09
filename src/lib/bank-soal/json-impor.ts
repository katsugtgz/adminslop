export function normalisasiJsonTempel(input: string): string {
  let output = "";
  let dalamString = false;
  let escaped = false;

  for (const char of input) {
    if (!dalamString) {
      output += char;
      if (char === '"') dalamString = true;
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      output += char;
      dalamString = false;
      continue;
    }

    output += char === "\n" || char === "\r" ? " " : char;
  }

  return output;
}

export function parseJsonTempel(input: string): unknown {
  try {
    return JSON.parse(input) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return JSON.parse(normalisasiJsonTempel(input)) as unknown;
    }
    throw error;
  }
}

function normalisasiNilaiJson(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (Array.isArray(value)) return value.map(normalisasiNilaiJson);
  if (typeof value === "object" && value !== null) return normalisasiKunciJson(value);
  return value;
}

export function normalisasiKunciJson(row: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replaceAll(/\s/g, ""),
      normalisasiNilaiJson(value),
    ])
  );
}
