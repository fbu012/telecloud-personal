import { json, type Env } from '../_common';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const expected = normalizeToken(env.LOCAL_AGENT_TOKEN);
  const received = getRequestToken(request);
  const configured = Boolean(expected);
  const matched = configured && Boolean(received) && received === expected;

  return json({
    ok: true,
    configured,
    matched,
    received: tokenAudit(received),
    expected: {
      configured,
      length: expected.length,
      fingerprint: expected ? fingerprint(expected) : 'empty',
    },
  });
};

function getRequestToken(request: Request): string {
  const url = new URL(request.url);
  const header = request.headers.get('authorization') || '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice('Bearer '.length) : '';
  const custom = request.headers.get('x-local-agent-token') || '';
  const query = url.searchParams.get('agent_token') || '';

  return normalizeToken(bearer || custom || query);
}

function normalizeToken(value: string | null | undefined): string {
  let token = String(value || '').trim();

  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    token = token.slice(1, -1).trim();
  }

  return token;
}

function tokenAudit(token: string) {
  return {
    provided: Boolean(token),
    length: token.length,
    fingerprint: token ? fingerprint(token) : 'empty',
    starts: token.length >= 4 ? token.slice(0, 4) : '',
    ends: token.length >= 4 ? token.slice(-4) : '',
  };
}

function fingerprint(token: string): string {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}
