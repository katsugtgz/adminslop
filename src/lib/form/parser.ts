/**
 * Shared FormData field parsers for server actions. Per src/app/AGENTS.md
 * canonical server action flow step 4: validate FormData with trimmed strings
 * and closed-vocabulary type guards. `pengaturan` uses zod instead.
 */

export function trimField(formData: FormData, key: string): string {
  const val = formData.get(key);
  return typeof val === "string" ? val.trim() : "";
}

export function optionalString(
  formData: FormData,
  key: string,
): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  return raw || null;
}

export function requiredString(
  formData: FormData,
  key: string,
  error: string,
): string {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) throw new Error(error);
  return raw;
}

export function checkboxField(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}
