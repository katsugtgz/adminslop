import type { Metadata } from "next";

import { PusatBantuan } from "@/components/pusat-bantuan";

export const metadata: Metadata = {
  title: "Bantuan",
  description: "Pusat bantuan EduAdmin Pro Premium.",
};

export default function BantuanPage() {
  return <PusatBantuan />;
}
