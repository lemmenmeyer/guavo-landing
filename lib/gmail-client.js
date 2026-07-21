// Thin Gmail API client for Vercel serverless functions.
//
// Only exposes what the decline-email draft flow needs: create a draft in
// daniel@guavo.com's Gmail (or whatever GMAIL_CLIENT_ID's associated user
// is), authenticated via a long-lived refresh token exchanged for a short-
// lived access token on every invocation.
//
// One-time setup lives in ~/.guavo-underwriting/intake/gmail_auth.mjs —
// it walks a local OAuth flow, writes .gmail_env with the 3 secrets, and
// the same 3 secrets get copied into Vercel env.
//
// Env vars:
//   GMAIL_CLIENT_ID       — from Google Cloud → APIs & Services → Credentials
//   GMAIL_CLIENT_SECRET   — same
//   GMAIL_REFRESH_TOKEN   — from gmail_auth.mjs local flow (scope: gmail.modify)

const TOKEN_URL  = 'https://oauth2.googleapis.com/token';
const DRAFTS_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts';

// Exchange the refresh token for a short-lived access token. Cached per-
// module-instance so back-to-back calls in the same invocation don't
// re-hit Google, but Vercel's cold-start model means most invocations
// end up fetching a fresh one anyway.
let _cached = { token: null, expiresAt: 0 };
async function getAccessToken() {
  const now = Date.now();
  if (_cached.token && _cached.expiresAt > now + 30_000) return _cached.token;

  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail credentials missing: GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN.');
  }

  const body = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
  });
  const resp = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Gmail token exchange failed: HTTP ${resp.status} ${errText.slice(0, 300)}`);
  }
  const data = await resp.json();
  if (!data.access_token) {
    throw new Error(`Gmail token response missing access_token: ${JSON.stringify(data).slice(0, 300)}`);
  }
  _cached = {
    token:     data.access_token,
    expiresAt: now + (Number(data.expires_in) || 3600) * 1000,
  };
  return _cached.token;
}

// Build an RFC 2822 message with multipart/alternative bodies. Gmail is
// strict about CRLF line endings between headers and body — every join
// uses \r\n. Subject and any header value that contains non-ASCII gets
// MIME encoded-word encoded so accented characters don't corrupt.
function buildRFC2822({ from, to, subject, textBody, htmlBody, replyTo, inReplyTo, references }) {
  const boundary = 'guavo_boundary_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (replyTo)    headers.push(`Reply-To: ${replyTo}`);
  if (inReplyTo)  headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headers.push(`References: ${references}`);

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    textBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return headers.join('\r\n') + '\r\n\r\n' + body;
}

// MIME encoded-word for a header value. Only used when the value has any
// non-ASCII characters — pure-ASCII headers pass through unchanged so
// Gmail displays them normally.
function encodeHeaderValue(str) {
  const s = String(str);
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
}

// Base64url is base64 with +/= replaced by -_ and trailing = stripped.
// Gmail requires the raw message field in this encoding.
function toBase64Url(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Create a draft in the authenticated user's Gmail. Returns
//   { draftId, messageId, threadId, draftUrl }
// draftUrl opens the draft's thread in the Gmail web UI (works for the
// primary account slot u/0; if the user has multiple accounts signed in
// they may need to switch — Gmail defaults to whichever session is active).
async function createDraft({ from, to, subject, textBody, htmlBody, replyTo, inReplyTo, references, threadId }) {
  if (!from || !to || !subject) {
    throw new Error('createDraft requires from, to, subject');
  }

  const raw = toBase64Url(buildRFC2822({ from, to, subject, textBody: textBody || '', htmlBody: htmlBody || '', replyTo, inReplyTo, references }));

  const message = { raw };
  if (threadId) message.threadId = threadId;

  const token = await getAccessToken();
  const resp = await fetch(DRAFTS_URL, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ message }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Gmail drafts.create failed: HTTP ${resp.status} ${errText.slice(0, 500)}`);
  }
  const data = await resp.json();
  const draftId   = data.id;
  const messageId = data.message && data.message.id;
  const threadIdOut = data.message && data.message.threadId;
  if (!draftId) throw new Error(`Gmail drafts.create returned no id: ${JSON.stringify(data).slice(0, 300)}`);

  return {
    draftId,
    messageId,
    threadId: threadIdOut,
    draftUrl: threadIdOut ? `https://mail.google.com/mail/u/0/#drafts/${threadIdOut}` : `https://mail.google.com/mail/u/0/#drafts`,
  };
}

module.exports = { createDraft, getAccessToken, buildRFC2822 };
