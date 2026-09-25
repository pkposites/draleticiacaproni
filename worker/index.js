/**
 * caproni-capi
 * Recebe eventos do navegador (LP Dra. Letícia Caproni) e reenvia
 * server-side para a Meta Conversions API, com o mesmo event_id usado no
 * fbq() do navegador (deduplicação automática).
 *
 * Regras (diagnóstico da Meta, set/2026):
 *  - Todo evento leva user_data: IP, navegador, fbp, fbc, external_id e,
 *    quando houver, telefone/nome/e-mail com hash SHA-256. Evento sem nenhum
 *    identificador (fbp, fbc, external_id, ph, em) é RECUSADO e registrado.
 *  - Lead leva value numérico e currency "BRL".
 *  - Nada que indique condição de saúde vai para a Meta: sem custom params
 *    de texto (content_name, campanha, anúncio, respostas do quiz) e
 *    event_source_url sem querystring, exceto fbclid/utm_source/utm_medium e
 *    IDs numéricos.
 *
 * Também recebe eventos offline (avaliação realizada, cirurgia agendada)
 * reportados manualmente, casando com o clique original via um código de
 * referência (ref) guardado no KV.
 *
 * Env vars (wrangler secret / vars):
 *   META_ACCESS_TOKEN     -> token de sistema com permissão ads_management (secret)
 *   PIXEL_ID              -> 1034926504222895 (var)
 *   TEST_EVENT_CODE       -> opcional, código do Testar eventos
 *   ALLOWED_ORIGIN        -> domínios da LP, separados por vírgula (var)
 *   OFFLINE_EVENTS_TOKEN  -> secret, obrigatório para POST /offline-event
 *   GRAPH_VERSION         -> opcional, versão da Graph API (padrão v24.0)
 *
 * Bindings (wrangler.toml):
 *   LEADS  -> KV namespace, guarda ref -> {fbp, fbc, event_source_url, ts}
 */

const DEFAULT_PIXEL_ID = '1034926504222895';
const DEFAULT_GRAPH_VERSION = 'v24.0';
const REF_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 dias

// Únicos eventos aceitos do navegador.
const BROWSER_EVENTS = ['Lead', 'lead_qualificado'];

// Parâmetros de URL que podem ir para a Meta (nenhum carrega texto livre).
const SAFE_URL_PARAMS = ['fbclid', 'utm_source', 'utm_medium', 'utm_id', 'campaign_id', 'adset_id', 'ad_id'];

// Chaves de user_data que identificam a pessoa (IP e navegador sozinhos não bastam).
const IDENTIFIER_KEYS = ['fbp', 'fbc', 'external_id', 'ph', 'em'];

// Eventos offline aceitos no /offline-event -> nome do evento mandado pra Meta.
const OFFLINE_EVENT_MAP = {
  AvaliacaoRealizada: 'Schedule',
  CirurgiaAgendada: 'Purchase',
};

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const list = allowedOrigins(env);
  const allow = list.length === 0 ? '*' : list.includes(origin) ? origin : list[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Offline-Token',
    Vary: 'Origin',
  };
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

/** Log sem dados pessoais: só nome do evento, chaves presentes e resultado. */
function log(entry) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const isHashed = (value) => /^[a-f0-9]{64}$/.test(value);

/** Só dígitos, com 55 na frente (números brasileiros digitados sem o código do país). */
function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  return digits.length <= 11 ? '55' + digits : digits;
}

/** Minúsculo, sem acentos nem pontuação, como a Meta pede antes do hash. */
function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** URL da página só com origem, caminho e os parâmetros seguros. */
function cleanUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    const clean = new URL(url.origin + url.pathname);
    for (const key of SAFE_URL_PARAMS) {
      const v = url.searchParams.get(key);
      if (v && v.length <= 500) clean.searchParams.set(key, v);
    }
    return clean.toString();
  } catch (e) {
    return '';
  }
}

const validFbp = (v) => typeof v === 'string' && /^fb\.\d\.\d+\.\d+$/.test(v);
const validFbc = (v) => typeof v === 'string' && /^fb\.\d\.\d+\.[A-Za-z0-9_-]+$/.test(v) && v.length <= 500;

async function buildUserData(request, fields) {
  const userData = {};
  const ip = request.headers.get('CF-Connecting-IP');
  const ua = request.headers.get('User-Agent');
  if (ip) userData.client_ip_address = ip;
  if (ua) userData.client_user_agent = ua;
  if (validFbp(fields.fbp)) userData.fbp = fields.fbp;
  if (validFbc(fields.fbc)) userData.fbc = fields.fbc;
  if (fields.external_id) {
    const id = String(fields.external_id).trim().toLowerCase();
    if (id) userData.external_id = isHashed(id) ? id : await sha256Hex(id);
  }
  const phone = normalizePhone(fields.phone);
  if (phone) userData.ph = await sha256Hex(phone);
  const email = String(fields.email || '').trim().toLowerCase();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) userData.em = await sha256Hex(email);
  const firstName = normalizeName(fields.first_name);
  if (firstName) userData.fn = await sha256Hex(firstName);
  return userData;
}

/** value numérico + currency em 3 letras maiúsculas; sem valor válido, nada. */
function buildValue(value, currency) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  const cur = String(currency || '').trim().toUpperCase();
  if (!Number.isFinite(n) || n <= 0 || !/^[A-Z]{3}$/.test(cur)) return null;
  return { value: Math.round(n * 100) / 100, currency: cur };
}

async function sendToMeta(env, eventEntry) {
  const pixelId = env.PIXEL_ID || DEFAULT_PIXEL_ID;
  const version = env.GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
  // O token vai no corpo, nunca na URL (URLs aparecem em logs).
  const payload = { data: [eventEntry], access_token: env.META_ACCESS_TOKEN };
  if (env.TEST_EVENT_CODE) payload.test_event_code = env.TEST_EVENT_CODE;

  const metaRes = await fetch(`https://graph.facebook.com/${version}/${pixelId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: metaRes.status, data: await metaRes.json() };
}

function hasIdentifier(userData) {
  return IDENTIFIER_KEYS.some((k) => userData[k]);
}

// POST /event — lead_qualificado e Lead vindos do script.js da LP.
async function handleEvent(request, env, headers) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'invalid_json' }, 400, headers);
  }
  body = body || {};
  const { event_name, event_id, ref } = body;

  if (!BROWSER_EVENTS.includes(event_name) || typeof event_id !== 'string' || !event_id || event_id.length > 100) {
    return jsonResponse({ error: 'invalid_event_name_or_event_id', allowed: BROWSER_EVENTS }, 400, headers);
  }
  if (!env.META_ACCESS_TOKEN) {
    return jsonResponse({ error: 'server_not_configured' }, 500, headers);
  }

  const userData = await buildUserData(request, body);
  if (!hasIdentifier(userData)) {
    log({ route: 'event', event: event_name, rejected: 'no_user_data', keys: Object.keys(userData) });
    return jsonResponse({ error: 'missing_user_data', required_one_of: IDENTIFIER_KEYS }, 422, headers);
  }

  const eventSourceUrl = cleanUrl(body.event_source_url);
  const eventEntry = {
    event_name,
    event_time: Math.floor(Date.now() / 1000),
    event_id,
    action_source: 'website',
    user_data: userData,
  };
  if (eventSourceUrl) eventEntry.event_source_url = eventSourceUrl;
  if (event_name === 'Lead') {
    // Sem valor real: valor fixo de lead (1 BRL), igual ao pixel.
    eventEntry.custom_data = buildValue(body.value, body.currency) || { value: 1, currency: 'BRL' };
  }

  if (typeof ref === 'string' && /^[a-z0-9-]{4,60}$/.test(ref) && env.LEADS) {
    try {
      await env.LEADS.put(
        `ref:${ref}`,
        JSON.stringify({ fbp: userData.fbp || '', fbc: userData.fbc || '', event_source_url: eventSourceUrl, ts: Date.now() }),
        { expirationTtl: REF_TTL_SECONDS }
      );
    } catch (e) {
      // Não bloqueia o envio do evento principal se o KV falhar.
    }
  }

  try {
    const { status, data } = await sendToMeta(env, eventEntry);
    log({ route: 'event', event: event_name, keys: Object.keys(userData), status, received: data && data.events_received });
    return jsonResponse(data, status, headers);
  } catch (err) {
    log({ route: 'event', event: event_name, error: 'meta_request_failed' });
    return jsonResponse({ error: 'meta_request_failed' }, 502, headers);
  }
}

// POST /offline-event — reportado manualmente quando o lead vira
// AvaliacaoRealizada / CirurgiaAgendada depois da conversa no WhatsApp.
// Body: { ref, event_name, phone?, email?, value?, currency? }
// Requer header X-Offline-Token igual a env.OFFLINE_EVENTS_TOKEN.
async function handleOfflineEvent(request, env, headers) {
  if (!env.OFFLINE_EVENTS_TOKEN) {
    return jsonResponse({ error: 'offline_events_not_configured' }, 500, headers);
  }
  const token = request.headers.get('X-Offline-Token') || '';
  if (token !== env.OFFLINE_EVENTS_TOKEN) {
    return jsonResponse({ error: 'unauthorized' }, 401, headers);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'invalid_json' }, 400, headers);
  }

  const { ref, event_name, phone, email } = body || {};
  const metaEventName = OFFLINE_EVENT_MAP[event_name];
  if (!metaEventName) {
    return jsonResponse({ error: 'invalid_event_name', allowed: Object.keys(OFFLINE_EVENT_MAP) }, 400, headers);
  }
  if (!phone && !email) {
    return jsonResponse({ error: 'missing_phone_or_email' }, 400, headers);
  }
  if (!env.META_ACCESS_TOKEN) {
    return jsonResponse({ error: 'server_not_configured' }, 500, headers);
  }

  let stored = null;
  if (ref && env.LEADS) {
    try {
      const raw = await env.LEADS.get(`ref:${ref}`);
      if (raw) stored = JSON.parse(raw);
    } catch (e) {
      // segue sem fbp/fbc se o KV falhar ou o ref não existir/expirou
    }
  }

  const userData = {};
  const normalized = normalizePhone(phone);
  if (normalized) userData.ph = await sha256Hex(normalized);
  if (email) userData.em = await sha256Hex(String(email).trim().toLowerCase());
  if (stored?.fbp) userData.fbp = stored.fbp;
  if (stored?.fbc) userData.fbc = stored.fbc;
  if (ref) userData.external_id = await sha256Hex(String(ref).trim().toLowerCase());
  if (!hasIdentifier(userData)) {
    log({ route: 'offline-event', event: metaEventName, rejected: 'no_user_data' });
    return jsonResponse({ error: 'missing_user_data' }, 422, headers);
  }

  const eventEntry = {
    event_name: metaEventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: `offline-${ref || 'noref'}-${metaEventName}`,
    action_source: 'system_generated',
    user_data: userData,
  };
  const eventSourceUrl = cleanUrl(stored?.event_source_url || '');
  if (eventSourceUrl) eventEntry.event_source_url = eventSourceUrl;
  const value = buildValue(body.value, body.currency || 'BRL');
  if (value) eventEntry.custom_data = value;

  try {
    const { status, data } = await sendToMeta(env, eventEntry);
    log({ route: 'offline-event', event: metaEventName, keys: Object.keys(userData), status });
    return jsonResponse({ matched_ref: Boolean(stored), meta: data }, status, headers);
  } catch (err) {
    return jsonResponse({ error: 'meta_request_failed' }, 502, headers);
  }
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    if (url.pathname.endsWith('/health')) {
      return new Response('ok', { status: 200, headers });
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405, headers);
    }

    if (url.pathname.endsWith('/offline-event')) {
      return handleOfflineEvent(request, env, headers);
    }
    return handleEvent(request, env, headers);
  },
};
