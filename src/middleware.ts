import { authkitMiddleware } from '@workos-inc/authkit-nextjs';

export default authkitMiddleware();

export const config = {
  matcher: [
    '/',
    '/dashboard',
    '/dashboard/:path*',
    '/api/auth/:path*',
    // /api/sinkronisasi uses withAuth() which requires middleware coverage
    // for session cookie refresh (identity doc §11, server.ts:20-24).
    '/api/sinkronisasi',
  ],
};
