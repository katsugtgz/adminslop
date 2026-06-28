"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMasuk } from "@/components/akses/use-masuk";

/**
 * TombolMasuk — primary client-side login trigger.
 *
 * Authentication in this app is handled by WorkOS AuthKit on the client via
 * `refreshAuth({ ensureSignedIn: true })`. There is no server action for
 * signing in, so any login affordance outside the global NavAuth must be a
 * client component. Mirrors the Masuk button in nav-auth.tsx.
 */
export function TombolMasuk() {
  const { refreshAuth } = useAuth();
  const masuk = useMasuk(refreshAuth);
  return (
    <Button
      type="button"
      onClick={masuk}
      aria-label="Masuk ke EduAdmin Pro Premium"
    >
      <LogIn aria-hidden="true" />
      Masuk
    </Button>
  );
}
