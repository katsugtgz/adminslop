import { authkitMiddleware } from '@workos-inc/authkit-nextjs';

export default authkitMiddleware();

export const config = {
  matcher: [
    '/',
    '/dashboard',
    '/dashboard/:path*',
    '/api/auth/:path*',
  ],
};
