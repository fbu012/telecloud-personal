import { errorJson, isAuthenticated, type Env } from './api/_common';

const PUBLIC_API_PATHS = new Set(['/api/auth/login', '/api/auth/logout', '/api/auth/me', '/api/health', '/api/public/share', '/api/public/download']);

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);

  if (url.pathname.startsWith('/api/') && !PUBLIC_API_PATHS.has(url.pathname)) {
    const authed = await isAuthenticated(context.request, context.env);
    if (!authed) return errorJson('Unauthorized', 401);
  }

  return context.next();
};
