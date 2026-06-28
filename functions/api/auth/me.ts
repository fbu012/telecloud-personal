import { isAuthenticated, json, type Env } from '../_common';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const authenticated = await isAuthenticated(request, env);
  return json({ ok: true, authenticated, app_name: env.APP_NAME || 'TeleCloud Personal' });
};
