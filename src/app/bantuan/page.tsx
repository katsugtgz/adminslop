import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Bantuan",
  description: "Pusat bantuan EduAdmin Pro Premium.",
};

export default function BantuanPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Bantuan</h1>
      <p className="text-muted-foreground">
        Bantuan Kontekstual aktif di setiap modul. Untuk saat ini, Anda dapat
        membaca Panduan Penggunaan terlebih dahulu.
      </p>
      <Button asChild className="w-fit">
        <Link href="/panduan">Buka Panduan Penggunaan</Link>
      </Button>
    </div>
  );
}
