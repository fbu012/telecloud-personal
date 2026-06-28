import { clearSessionCookie, json, type Env } from '../_common';

export const onRequestPost: PagesFunction<Env> = async ({ request }) => {
  return json({ ok: true }, { headers: { 'set-cookie': clearSessionCookie(request) } });
};
