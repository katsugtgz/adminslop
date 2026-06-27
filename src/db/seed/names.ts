/**
 * Pools nama Bahasa Indonesia + util RNG reproducible untuk seed dev.
 * Deterministik (mulberry32) supaya re-run seed menghasilkan dataset identik.
 */

/** Seeded PRNG (mulberry32) — output stabil lintas Node/platform. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

/** Ambil elemen acak deterministik. */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

/** Integer [min, max] inklusif. */
export function intBetween(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Ambil n elemen unik. */
export function sample<T>(rng: Rng, arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy.splice(idx, 1)[0]!);
  }
  return out;
}

export const NAMA_DEPAN_L = [
  "Muhammad", "Ahmad", "Abdul", "Rizky", "Fajar", "Bayu", "Dimas", "Andi",
  "Rizal", "Fahmi", "Hendra", "Yusuf", "Aditya", "Bagus", "Galih", "Ilham",
  "Reza", "Surya", "Wahyu", "Yoga", "Arif", "Dani", "Eko", "Ferry",
];
export const NAMA_DEPAN_P = [
  "Siti", "Ani", "Dewi", "Nur", "Putri", "Sri", "Wati", "Yuni",
  "Fitri", "Indah", "Lestari", "Maya", "Nabila", "Rahma", "Salsabila", "Tari",
  "Umi", "Vina", "Wulan", "Zahra", "Ayu", "Citra", "Eka", "Hana",
];
export const NAMA_BELAKANG = [
  "Saputra", "Pratama", "Wijaya", "Santoso", "Hidayat", "Maulana", "Nugroho",
  "Kusuma", "Ramadhan", "Permana", "Setiawan", "Firmansyah", "Anggara", "Putra",
  "Handoko", "Susanto", "Halim", "Iskandar", "Rahman", "Yulianto", "Ginting",
  "Simanjuntak", "Tampubolon", "Sitorus",
];
export const NAMA_WALI_L = [
  "Bapak", "Ayah",
];
export const NAMA_DEPAN_PTK = [
  "Bambang", "Slamet", "Untung", "Gunawan", "Hartono", "Joko", "Krisna",
  "Agus", "Budi", "Eddy",
];
export const NAMA_DEPAN_PTK_P = [
  "Endang", "Sumarni", "Wardah", "Latifah", "Rahayu", "Sutini", "Minarsih",
  "Yuliana", "Marlina", "Darmawati",
];

/** Nama lengkap acak dengan gender. */
export function namaAcak(
  rng: Rng,
  jenisKelamin: "L" | "P",
): { nama: string; jk: "L" | "P" } {
  const depan =
    jenisKelamin === "L"
      ? pick(rng, NAMA_DEPAN_L)
      : pick(rng, NAMA_DEPAN_P);
  const belakang = pick(rng, NAMA_BELAKANG);
  return { nama: `${depan} ${belakang}`, jk: jenisKelamin };
}

/** NISN 10 digit unik deterministik dari seed global. */
export function nisnAcak(rng: Rng): string {
  let s = "";
  for (let i = 0; i < 10; i++) s += String(intBetween(rng, 0, 9));
  return s;
}

/**
 * UUID deterministik (RFC-4122 v4-shape) dari string input. Dipakai seed
 * supaya id stabil lintas re-run → URL deep-link e2e reproducible.
 *
 * Bukan UUID kriptografis — tujuannya cuma determinisme + format uuid PG.
 * Pakai cyrb53 (dua pass) lalu format 8-4-4-4-12 + set bit versi (4)/variant.
 */
export function uuidDeterministik(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex32 = (
    (h2 >>> 0).toString(16).padStart(8, "0") +
    (h1 >>> 0).toString(16).padStart(8, "0")
  ).repeat(2).slice(0, 32); // 32 hex chars
  // Override bit version (pos 12 = '4') + variant (pos 16 ∈ 8/9/a/b).
  const v = parseInt(hex32[16] ?? "0", 16) % 4; // 0..3
  const variant = (0x8 + v).toString(16);        // 8/9/a/b
  const fixed =
    hex32.slice(0, 12) + "4" + hex32.slice(13, 16) + variant + hex32.slice(17, 32);
  return (
    fixed.slice(0, 8) + "-" +
    fixed.slice(8, 12) + "-" +
    fixed.slice(12, 16) + "-" +
    fixed.slice(16, 20) + "-" +
    fixed.slice(20, 32)
  );
}
