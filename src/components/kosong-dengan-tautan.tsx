import Link from "next/link";

import { Button } from "@/components/ui/button";

export interface KosongDenganTautanProps {
  pesan: string;
  /** Bila dihilangkan, hanya pesan yang ditampilkan (tanpa CTA). */
  href?: string;
  labelTautan?: string;
  judul?: string;
}

export function KosongDenganTautan({
  pesan,
  href,
  labelTautan,
  judul,
}: KosongDenganTautanProps) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-accent/30 bg-accent/[0.03] p-6 text-center text-sm text-muted-foreground">
      {judul ? (
        <h3 className="font-display text-lg tracking-tight text-foreground">
          {judul}
        </h3>
      ) : null}
      <p>{pesan}</p>
      {href && labelTautan ? (
        <Button asChild variant="outline" size="sm">
          <Link href={href}>{labelTautan}</Link>
        </Button>
      ) : null}
    </section>
  );
}

export default KosongDenganTautan;
