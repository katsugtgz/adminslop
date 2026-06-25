'use client';

import { useAuth } from '@workos-inc/authkit-nextjs/components';
import { signOutAction } from '@/app/auth/actions';

export function NavAuth() {
  const { user, loading, refreshAuth } = useAuth();

  if (loading) {
    return <span className="text-gray-400">Loading...</span>;
  }

  if (user) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm">{user.email}</span>
        <form action={signOutAction}>
          <button
            type="submit"
            className="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded"
          >
            Sign out
          </button>
        </form>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void refreshAuth({ ensureSignedIn: true })}
      className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded"
    >
      Sign in
    </button>
  );
}
