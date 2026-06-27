import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock the WorkOS AuthKit client hook used by TombolMasuk so the unauth
// "Masuk" button renders without a provider. `refreshAuth` is hoisted to a
// stable instance so click assertions can reference the same mock.
const refreshAuthMock = vi.fn();
vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    refreshAuth: refreshAuthMock,
  }),
}));

// signOutAction is a server action; stub it so the "Keluar" <form> renders.
vi.mock("@/app/auth/actions", () => ({
  signOutAction: vi.fn(),
}));

import { PembatasanAkses } from "./pembatasan-akses";

/**
 * ISSUE-003 regression — /dashboard "Pembatasan Akses" used to be a dead end:
 * it offered only "Keluar" (Logout) even for unauthenticated visitors, who
 * therefore had no way to log in. The screen must branch on auth state:
 *
 *  - unauthenticated  → primary "Masuk" (Login) button, no "Keluar"
 *  - authenticated    → "Keluar" + ask the Pengguna to request Keanggotaan
 *
 * Both states resolve to `status: "denied"` server-side, so the distinction
 * is carried by the `authenticated` prop.
 */
describe("PembatasanAkses — login affordance by auth state", () => {
  it("shows a Masuk button (not Keluar) when unauthenticated", () => {
    render(<PembatasanAkses authenticated={false} />);

    expect(
      screen.getByRole("heading", { name: /pembatasan akses/i }),
    ).toBeInTheDocument();

    // Unauthenticated copy — guides the user to sign in first.
    expect(
      screen.getByText(/perlu masuk terlebih dahulu/i),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /masuk ke eduadmin pro premium/i }),
    ).toBeInTheDocument();

    // No logout affordance for a user who isn't signed in.
    expect(screen.queryByRole("button", { name: /^keluar$/i })).toBeNull();
  });

  it("shows a Keluar button (not Masuk) when authenticated but membershipless", () => {
    render(<PembatasanAkses authenticated={true} />);

    // Authenticated copy — request Keanggotaan from the Admin Satuan Pendidikan.
    expect(
      screen.getByText(/belum terdaftar sebagai anggota/i),
    ).toBeInTheDocument();

    const keluarForm = screen.getByLabelText(/keluar dari sesi/i);
    expect(keluarForm).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^keluar$/i }),
    ).toBeInTheDocument();

    // No login affordance for a user already signed in.
    expect(
      screen.queryByRole("button", { name: /masuk ke eduadmin/i }),
    ).toBeNull();
  });

  it("defaults to the unauthenticated (Masuk) branch when no prop is given", () => {
    render(<PembatasanAkses />);

    expect(
      screen.getByRole("button", { name: /masuk ke eduadmin/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^keluar$/i })).toBeNull();
  });

  it("the Masuk button invokes AuthKit refreshAuth on click", async () => {
    refreshAuthMock.mockClear();
    render(<PembatasanAkses authenticated={false} />);

    fireEvent.click(
      screen.getByRole("button", { name: /masuk ke eduadmin pro premium/i }),
    );

    expect(refreshAuthMock).toHaveBeenCalledWith({ ensureSignedIn: true });
  });
});
