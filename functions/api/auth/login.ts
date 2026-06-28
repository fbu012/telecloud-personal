import { createSessionCookie, errorJson, json, type Env } from '../_common';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return errorJson('ADMIN_PASSWORD or SESSION_SECRET is not configured', 500);
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  if (!body.password || body.password !== env.ADMIN_PASSWORD) {
    return errorJson('Password salah', 401);
  }

  const cookie = await createSessionCookie(env, request);
  return json(
    { ok: true, authenticated: true, app_name: env.APP_NAME || 'TeleCloud Personal' },
    { headers: { 'set-cookie': cookie } },
  );
};
