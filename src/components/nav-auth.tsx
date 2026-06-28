"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { signOutAction } from "@/app/auth/actions";
import { useMasuk } from "@/components/akses/use-masuk";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function NavAuth() {
  const { user, loading, refreshAuth } = useAuth();
  const masuk = useMasuk(refreshAuth);

  if (loading) {
    return (
      <span className="text-sm text-foreground/70" aria-live="polite">
        Memuat…
      </span>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground max-[400px]:hidden">
          {user.email}
        </span>
        <form action={signOutAction} aria-label="Keluar dari sesi">
          <Button
            type="submit"
            variant="outline"
            size="sm"
            aria-label={`Keluar (${user.email})`}
          >
            <LogOut aria-hidden="true" />
            Keluar
          </Button>
        </form>
      </div>
    );
  }

  return (
    <Button
      type="button"
      onClick={masuk}
      aria-label="Masuk ke EduAdmin Pro Premium"
    >
      Masuk
    </Button>
  );
}
