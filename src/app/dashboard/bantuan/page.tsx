import type { Metadata } from "next";

import { PusatBantuan } from "@/components/pusat-bantuan";

export const metadata: Metadata = {
  title: "Pusat Bantuan",
  description:
    "Pertanyaan yang sering diajukan tentang EduAdmin Pro Premium dalam Bahasa Indonesia.",
};

export default function DashboardBantuanPage() {
  return <PusatBantuan />;
}
