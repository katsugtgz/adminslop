import { cn } from "@/lib/utils";

/**
 * Badge Notifikasi — unread count pill. Renders nothing when the count is 0
 * (no badge noise for an empty inbox). `jumlah` is the unread count from
 * {@linkcode hitungBelumDibaca}.
 */
export function BadgeNotifikasi({ jumlah }: { jumlah: number }) {
  if (jumlah <= 0) return null;
  return (
    <span
      aria-label={`${jumlah} Belum Dibaca`}
      className={cn(
        "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground"
      )}
    >
      {jumlah > 99 ? "99+" : jumlah}
    </span>
  );
}
