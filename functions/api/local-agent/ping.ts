import { json, requireLocalAgentAuth, type Env } from '../_common';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = requireLocalAgentAuth(env, request);
  if (unauthorized) return unauthorized;

  return json({
    ok: true,
    authenticated: true,
    local_agent_api: 'ready',
  });
};
