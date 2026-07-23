// Vercel Serverless Function — POST /api/send-decline
//
// Triggered by a Monday "When Decline Email Status changes to Ready, send
// webhook" automation on the Guavo Pipeline board. Creates a Gmail DRAFT in
// daniel@guavo.com's mailbox — never auto-sends — so Daniel reviews every
// compliance-heavy (FCRA §615(a) etc.) applicant email before it goes out.
//
// Flow:
//   1. Verify webhook signature (?secret= query param or X-Guavo-Webhook-Secret
//      header). Fail closed on mismatch.
//   2. Handle Monday's URL-verification challenge on first subscription.
//   3. Filter — only proceed for events on the Decline Email Status column
//      with new value = "Ready". All other column changes on the board no-op
//      silently.
//   4. Fetch the item via Monday GraphQL.
//   5. Validation gates — reason mapped, Stage=Declined, applicant email
//      present, Low FICO fields present when required, Decline Email Status
//      is a permitted state. Any failure → post an Update explaining, no
//      draft, return 200.
//   6. Compose email via reason-specific template.
//   7. Create Gmail draft in daniel@guavo.com via Gmail API. If item has an
//      Ack Email Message-ID captured (future-work column), thread the reply.
//   8. Write Decline Email Status → Drafted, post audit-trail Update with a
//      clickable Gmail draft URL + the rendered HTML.
//
// Daniel then opens Gmail, reviews the draft, sends it manually, and flips
// the Monday status to Sent. Manual final send is the human-in-the-loop step.
//
// Env vars (Vercel → Project → Settings → Environment Variables):
//   MONDAY_API_TOKEN       — personal API v2 token from staura.monday.com
//   MONDAY_WEBHOOK_SECRET  — long random string; the Monday automation includes
//                            it as ?secret=... on the webhook URL.
//   GMAIL_CLIENT_ID        — Google Cloud OAuth 2.0 Client ID (Desktop app)
//   GMAIL_CLIENT_SECRET    — from same
//   GMAIL_REFRESH_TOKEN    — from `node gmail_auth.mjs --email daniel@guavo.com`
//                            with gmail.modify scope
//
// Column IDs on the Guavo Pipeline board (18416816603) — pinned here rather
// than pulled from env because they never change without an intentional board
// migration. If a column id ever DOES change, update it here and in memory.

const templates = require('../lib/decline-templates');
const common    = require('../lib/decline-templates/common');
const monday    = require('../lib/monday-client');
const gmail     = require('../lib/gmail-client');

const COL = {
  DECLINE_REASON:        'color_mm5af0yz',
  DECLINE_REASON_2:      'color_mm5bm0fh',
  DECLINE_EMAIL_STATUS:  'color_mm5bvnb',
  STAGE:                 'color_mm446jj4',
  EXPERIAN_REPORT:       'file_mm5b2cm7',
  FICO:                  'numeric_mm5atj35',
  FICO_PULL_DATE:        'date_mm5bcep2',
  FICO_KEY_FACTORS:      'long_text_mm5b87nh',
  ACK_MESSAGE_ID:        'text_mm5bhzr9',
  APPLICANT_EMAIL:       'email_mm44bhsc',
  BUSINESS_LEGAL_NAME:   'text_mm44h259',
  OWNER_FIRST_NAME:      'text_mm5aa5wm',
  OWNER_LAST_NAME:       'text_mm5aa9t4',
  BUSINESS_STATE:        'text_mm444jzb',
};

// Stage label required for a send. The decline is drafted while the item is
// still in Underwriting; Stage moves to Declined only after the email is
// actually sent (human marks Decline Email Status = Sent, which a Monday
// automation flips to Stage = Declined). Any other Stage no-ops with an Update.
const REQUIRED_STAGE = 'Underwriting';

// Status labels the automation writes to Decline Email Status. Must match the
// labels on the Monday column color_mm5bvnb exactly (case-sensitive). The
// exact send date lives in the audit-trail Update, not in the status label
// (Monday status columns hold a fixed set of labels).
const STATUS = {
  NOT_SENT: 'Not sent',
  READY:    'Ready',
  DRAFTED:  'Drafted',
  SENT:     'Sent',
  BOUNCED:  'Bounced',
  ERROR:    'Error',
};

// Statuses that permit a new draft. Ready is the primary trigger; Not sent
// covers manual test invocations; Error is retryable so a failed attempt can
// be re-run without a manual reset. Downstream states (Drafted, Sent, Bounced)
// are treated as "already handled" — no-op with an explanatory Update.
const SENDABLE_STATUSES = new Set([STATUS.NOT_SENT, STATUS.READY, STATUS.ERROR, '', null, undefined]);

const FROM_ADDR   = 'Daniel at Guavo <daniel@guavo.com>';
const REPLY_TO    = 'daniel@guavo.com';

// Bumped on each deploy so a Monday Update / response reveals which build ran.
const BUILD_TAG   = 'boardid-fix-2026-07-23';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Missing request body.' });
  }

  // Monday's webhook registration handshake: on the very first POST after
  // subscription, Monday sends {"challenge": "<token>"} and expects the same
  // token echoed back so it can verify the endpoint owns the URL.
  if (body.challenge) {
    return res.status(200).json({ challenge: body.challenge });
  }

  // Auth: shared-secret via URL query param OR X-Guavo-Webhook-Secret header.
  // Monday's API-created webhook subscription cannot set custom headers, so
  // the query-param path is what fires in practice — the header path stays
  // for any future UI automation or manual curl.
  const expectedSecret = process.env.MONDAY_WEBHOOK_SECRET;
  const querySecret    = (req.query && req.query.secret) || getQueryParam(req.url, 'secret');
  const headerSecret   = req.headers['x-guavo-webhook-secret'] || req.headers['X-Guavo-Webhook-Secret'];
  const gotSecret      = querySecret || headerSecret;
  if (!expectedSecret) {
    return res.status(500).json({ ok: false, error: 'MONDAY_WEBHOOK_SECRET is not set on the server.' });
  }
  if (gotSecret !== expectedSecret) {
    return res.status(401).json({ ok: false, error: 'Bad or missing webhook secret.' });
  }

  const event = body.event || body;

  // Column filter — this endpoint is subscribed to board-wide change_column_value
  // events (Monday API doesn't accept a column-specific subscription for status
  // columns on this workspace). Only proceed when the event is on the Decline
  // Email Status column AND the new value is "Ready". Every other column change
  // on the board fires this endpoint too and must no-op silently.
  const eventColumnId = event.columnId || (event.data && event.data.columnId);
  const eventNewLabel = extractStatusLabel(event.value) || extractStatusLabel(event.data && event.data.value);
  if (eventColumnId && eventColumnId !== COL.DECLINE_EMAIL_STATUS) {
    return res.status(200).json({ ok: true, skipped: 'unrelated-column', eventColumnId });
  }
  if (eventNewLabel && eventNewLabel !== STATUS.READY) {
    return res.status(200).json({ ok: true, skipped: 'not-ready', eventNewLabel });
  }

  const itemId = event.pulseId || event.itemId || (event.data && (event.data.pulseId || event.data.itemId));
  if (!itemId) {
    return res.status(400).json({ ok: false, error: 'Webhook payload had no pulseId.' });
  }

  let item;
  try {
    item = await monday.fetchItem(itemId);
  } catch (err) {
    return res.status(502).json({ ok: false, error: `Monday fetch failed: ${err.message || err}` });
  }
  if (!item) {
    return res.status(404).json({ ok: false, error: `Item ${itemId} not found.` });
  }

  const cols = item.columns || {};
  const declineReason1 = (cols[COL.DECLINE_REASON]?.text   || '').trim();
  const declineReason2 = (cols[COL.DECLINE_REASON_2]?.text || '').trim();
  const currentStatus  = (cols[COL.DECLINE_EMAIL_STATUS]?.text || '').trim();
  const stage          = (cols[COL.STAGE]?.text || '').trim();
  const applicantEmail = (cols[COL.APPLICANT_EMAIL]?.text || '').trim();
  const businessName   = (cols[COL.BUSINESS_LEGAL_NAME]?.text || item.name || '').trim();
  const businessState  = (cols[COL.BUSINESS_STATE]?.text || '').trim();
  const ownerFirst     = (cols[COL.OWNER_FIRST_NAME]?.text || '').trim();
  const ficoStr        = (cols[COL.FICO]?.text || '').trim();
  const ficoPullDate   = (cols[COL.FICO_PULL_DATE]?.text || '').trim();
  const keyFactorsRaw  = (cols[COL.FICO_KEY_FACTORS]?.text || '').trim();
  const ackMessageId   = (cols[COL.ACK_MESSAGE_ID]?.text || '').trim();

  // Presence-of-file gate for the FCRA block. Column type "file" on Monday
  // returns a JSON payload in `value` with a files[] array when populated.
  const experianReportAttached = hasFile(cols[COL.EXPERIAN_REPORT]);

  // -- Validation gates. Any failure: post an Update, DO NOT send. --

  if (!SENDABLE_STATUSES.has(currentStatus)) {
    await monday.postUpdate(itemId, `Decline email already handled (Decline Email Status = <strong>${common.escapeHtml(currentStatus)}</strong>). No email sent.`).catch(noop);
    return res.status(200).json({ ok: true, skipped: 'already-handled', currentStatus });
  }

  if (!declineReason1) {
    await monday.postUpdate(itemId, 'Cannot send decline email: <strong>Decline Reason</strong> column is empty.').catch(noop);
    return res.status(200).json({ ok: true, skipped: 'no-reason' });
  }

  // Compose reasons list — Decline Reason 1 is required, Decline Reason 2 is
  // optional. Dedupe if the same label was set on both columns.
  const reasonLabels = [declineReason1];
  if (declineReason2 && declineReason2 !== declineReason1) reasonLabels.push(declineReason2);

  const reasonTemplates = [];
  const unmappedLabels  = [];
  for (const label of reasonLabels) {
    const t = templates[label];
    if (t) reasonTemplates.push(t);
    else   unmappedLabels.push(label);
  }
  if (unmappedLabels.length > 0) {
    await monday.postUpdate(itemId,
      `Decline reason${unmappedLabels.length > 1 ? 's' : ''} <strong>${unmappedLabels.map(common.escapeHtml).join(', ')}</strong> not mapped to a template. Add to <code>lib/decline-templates/index.js</code> or clear the column. No email sent.`
    ).catch(noop);
    return res.status(200).json({ ok: true, skipped: 'unmapped-reason', unmappedLabels });
  }

  // Stage gate — Stage must be Declined before the button fires. Prevents
  // accidental sends on items still in Underwriting / Proposal Sent / etc.
  if (stage !== REQUIRED_STAGE) {
    await monday.postUpdate(itemId,
      `Cannot send decline email: Stage is "<strong>${common.escapeHtml(stage || '(empty)')}</strong>" — must be "<strong>${REQUIRED_STAGE}</strong>" to fire the decline notice. Flip Stage to ${REQUIRED_STAGE} and re-click.`
    ).catch(noop);
    return res.status(200).json({ ok: true, skipped: 'stage-not-declined', stage });
  }

  if (!applicantEmail || !applicantEmail.includes('@')) {
    await monday.postUpdate(itemId, 'Cannot send decline email: applicant <strong>Email</strong> column is empty or invalid.').catch(noop);
    return res.status(200).json({ ok: true, skipped: 'no-email' });
  }

  const ficoKeyFactors = keyFactorsRaw
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);

  const templateCtx = {
    ownerFirstName: ownerFirst,
    businessName,
    businessState,
    experianReportAttached,
    fico:            ficoStr,
    ficoPullDate,
    ficoKeyFactors,
  };

  // Union of every reason's missingFields (dedupe by string).
  const missingAll = Array.from(new Set(
    reasonTemplates.flatMap(t => t.missingFields(templateCtx))
  ));
  if (missingAll.length > 0) {
    await monday.postUpdate(itemId,
      `Cannot send decline email. Missing required field${missingAll.length > 1 ? 's' : ''}: <strong>${missingAll.map(common.escapeHtml).join(', ')}</strong>. Populate and re-click the button.`
    ).catch(noop);
    return res.status(200).json({ ok: true, skipped: 'missing-fields', missing: missingAll });
  }

  const rendered = common.composeDeclineEmail({
    ownerFirstName: ownerFirst,
    businessName,
    businessState,
    reasons: reasonTemplates,
    experianReportAttached,
    fcraCtx: { score: ficoStr, scoreDate: ficoPullDate, keyFactors: ficoKeyFactors },
  });

  // -- Create draft in Gmail. --

  // Threading — populate In-Reply-To / References only when we captured the
  // Message-ID at ack time. Older items (or the current period before the
  // submit-application.js companion edit ships) fall through to a fresh
  // draft; the subject stays the same either way so future threading joins
  // cleanly once the Ack column starts getting populated.
  let inReplyTo = null;
  let references = null;
  if (ackMessageId) {
    const wrapped = ackMessageId.startsWith('<') ? ackMessageId : `<${ackMessageId}>`;
    inReplyTo  = wrapped;
    references = wrapped;
  }

  let draftInfo = null;
  let sendErr   = null;
  try {
    draftInfo = await gmail.createDraft({
      from:       FROM_ADDR,
      to:         applicantEmail,
      subject:    ackMessageId ? `Re: ${rendered.subject}` : rendered.subject,
      htmlBody:   rendered.html,
      textBody:   rendered.text,
      replyTo:    REPLY_TO,
      inReplyTo,
      references,
    });
  } catch (err) {
    sendErr = err.message || String(err);
  }

  if (sendErr) {
    await monday.updateStatusLabel(itemId, COL.DECLINE_EMAIL_STATUS, STATUS.ERROR).catch(noop);
    await monday.postUpdate(itemId, `<strong>Decline draft failed to create</strong> [${BUILD_TAG}]: ${common.escapeHtml(sendErr)}`).catch(noop);
    return res.status(502).json({ ok: false, error: sendErr, build: BUILD_TAG });
  }

  // -- Mark item as Drafted + write audit trail. --

  try {
    await monday.updateStatusLabel(itemId, COL.DECLINE_EMAIL_STATUS, STATUS.DRAFTED);
  } catch (err) {
    // Non-fatal — the draft was created. Surface the failure in an Update so
    // Daniel knows the Monday label didn't flip and he needs to set it
    // manually after sending from Gmail.
    await monday.postUpdate(itemId,
      `Draft created, but could not update Decline Email Status to <strong>Drafted</strong>: ${common.escapeHtml(err.message || String(err))}. Set the label manually.`
    ).catch(noop);
  }

  try {
    await monday.postUpdate(itemId,
      renderAuditUpdate({
        declineReason: reasonLabels.join(' + '),
        applicantEmail,
        draftInfo,
        threaded: !!ackMessageId,
        draftedAt: new Date().toISOString(),
        html: rendered.html,
      })
    );
  } catch (_err) { /* audit-trail failure is non-fatal */ }

  return res.status(200).json({
    ok:       true,
    drafted:  true,
    draftId:  draftInfo.draftId,
    draftUrl: draftInfo.draftUrl,
    threaded: !!ackMessageId,
    to:       applicantEmail,
    reasons:  reasonLabels,
  });
};

// -- Helpers --

function noop() { /* swallow non-fatal Update failures */ }

// Parse a single query parameter out of the request URL. Vercel usually
// exposes req.query already, but the raw URL fallback is here for the
// change_column_value event flow.
function getQueryParam(url, name) {
  if (!url) return null;
  const q = url.indexOf('?');
  if (q < 0) return null;
  const params = new URLSearchParams(url.slice(q + 1));
  return params.get(name);
}

// Monday's change_column_value webhook payload for a status column has
// value = { label: { text: "Ready", index: 1, style: {...} } }.
// Handle a few shapes defensively.
function extractStatusLabel(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (v.label && typeof v.label === 'object' && v.label.text) return v.label.text;
  if (typeof v.label === 'string') return v.label;
  if (v.text) return v.text;
  return null;
}

// Monday file column returns a JSON blob like:
//   value: '{"files":[{"assetId":123,"name":"...","isImage":"false","fileType":"..."}]}'
// text: comma-separated filenames when populated, empty string when not.
function hasFile(colVal) {
  if (!colVal) return false;
  if (colVal.text && colVal.text.trim().length > 0) return true;
  if (colVal.value) {
    try {
      const parsed = JSON.parse(colVal.value);
      if (parsed && Array.isArray(parsed.files) && parsed.files.length > 0) return true;
    } catch { /* fall through */ }
  }
  return false;
}

function renderAuditUpdate({ declineReason, applicantEmail, draftInfo, threaded, draftedAt, html }) {
  const draftUrl  = draftInfo && draftInfo.draftUrl;
  const draftId   = draftInfo && draftInfo.draftId;
  const messageId = draftInfo && draftInfo.messageId;
  return [
    `<p><strong>Decline draft created</strong> in daniel@guavo.com Gmail for ${common.escapeHtml(applicantEmail)}. Review + send from Gmail; then set Decline Email Status to <strong>Sent</strong>.</p>`,
    draftUrl ? `<p><a href="${common.escapeHtml(draftUrl)}">Open draft in Gmail →</a></p>` : '',
    `<p>Drafted at: <strong>${common.escapeHtml(draftedAt)}</strong></p>`,
    `<p>Reason: <strong>${common.escapeHtml(declineReason)}</strong>. From: daniel@guavo.com. Threaded: ${threaded ? 'yes' : 'no (fresh email)'}. Draft id: <code>${common.escapeHtml(draftId || 'none')}</code>. Message id: <code>${common.escapeHtml(messageId || 'none')}</code>.</p>`,
    `<details><summary>Rendered HTML (click to expand)</summary>${html}</details>`,
  ].filter(Boolean).join('');
}
