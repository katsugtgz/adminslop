export function parseFiniteNumber(value: string, message: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(message);
  return n;
}

export function requireIsoDate(value: string, message: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(message);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(message);
  if (date.toISOString().slice(0, 10) !== value) throw new Error(message);
  return value;
}

export function requireUuid(value: string, message: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(message);
  }
  return value;
}

export function assertReturnedRow<T>(row: T | undefined, message: string): T {
  if (row === undefined) throw new Error(message);
  return row;
}

export function requireFormString(formData: FormData, key: string, message: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") throw new Error(message);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

export function requireTextSize(value: string, maxBytes: number, message: string): string {
  if (Buffer.byteLength(value, "utf8") > maxBytes) throw new Error(message);
  return value;
}

export function requireFileSize(file: File, maxBytes: number, message: string): File {
  if (file.size > maxBytes) throw new Error(message);
  return file;
}
