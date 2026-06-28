"use client";

import { useCallback } from "react";

type RefreshAuth = (options: { ensureSignedIn: true }) => void | Promise<unknown>;

export function useMasuk(refreshAuth: RefreshAuth) {
  return useCallback(() => {
    void refreshAuth({ ensureSignedIn: true });
  }, [refreshAuth]);
}
