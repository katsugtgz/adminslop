import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  Geist_Mono,
  Plus_Jakarta_Sans,
} from "next/font/google";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";

import { AppShell } from "@/components/app-shell";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "EduAdmin Pro Premium",
  description:
    "Platform administrasi sekolah untuk Guru dan Satuan Pendidikan di Indonesia.",
};

export const viewport: Viewport = {
  themeColor: "#FBF8F1",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" dir="ltr">
      <body
        className={`${bricolage.variable} ${jakarta.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <AuthKitProvider>
          <AppShell>{children}</AppShell>
        </AuthKitProvider>
      </body>
    </html>
  );
}
