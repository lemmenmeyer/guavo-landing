// Vercel Serverless Function — POST /api/send-decline
//
// Triggered by a Monday "When button is clicked, send webhook" automation on
// the Send Decline Email button column of the Guavo Pipeline board.
//
// Flow:
//   1. Verify the webhook signature (X-Guavo-Webhook-Secret header must match
//      MONDAY_WEBHOOK_SECRET). Fail closed on mismatch.
//   2. Handle Monday's URL-verification challenge (echo back the challenge
//      value on the first webhook registration).
//   3. Fetch the item via Monday GraphQL.
//   4. Run every validation gate — decline reason known, Low FICO fields
//      present if applicable, Business State on the APPROVED_STATES list,
//      applicant email present, Decline Email Status is Not sent / Ready.
//      Any failure → post an Update explaining what's missing, DO NOT send,
//      return 200 (Monday retries 4xx/5xx).
//   5. Compose the email via the reason-specific template.
//   6. Send via Resend from patti@guavo.com. If the item has an
//      Ack Email Message-ID captured (future-work column), thread the reply.
//   7. Write Decline Email Status → Sent YYYY-MM-DD and post the rendered
//      HTML as an audit-trail Update on the item.
//
// Env vars (Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY          — starts with re_...
//   MONDAY_API_TOKEN        — personal API v2 token from staura.monday.com
//   MONDAY_WEBHOOK_SECRET   — arbitrary long secret; the Monday automation
//                             includes it as an X-Guavo-Webhook-Secret header.
//
// Column IDs on the Guavo Pipeline board (18416816603) — pinned here rather
// than pulled from env because they never change without an intentional board
// migration. If a column id ever DOES change, update it here and in memory.

const templates = require('../lib/decline-templates');
const common    = require('../lib/decline-templates/common');
const monday    = require('../lib/monday-client');

const COL = {
  DECLINE_REASON:        'color_mm5af0yz',
  DECLINE_EMAIL_STATUS:  'color_mm5bvnb',
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

// Status labels the automation writes to Decline Email Status. Must match the
// labels on the Monday column color_mm5bvnb exactly (case-sensitive). The
// exact send date lives in the audit-trail Update, not in the status label
// (Monday status columns hold a fixed set of labels).
const STATUS = {
  NOT_SENT: 'Not sent',
  READY:    'Ready',
  SENT:     'Sent',
  BOUNCED:  'Bounced',
  ERROR:    'Error',
};

// Statuses that permit a send. Anything else (already Sent, Bounced, Error) is
// treated as "someone/something already handled this" — no-op with an Update.
const SENDABLE_STATUSES = new Set([STATUS.NOT_SENT, STATUS.READY, '', null, undefined]);

const FROM_ADDR   = 'Patti at Guavo <patti@guavo.com>';
const REPLY_TO    = 'patti@guavo.com';

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

  // Auth: shared-secret header set by the Monday automation.
  const expectedSecret = process.env.MONDAY_WEBHOOK_SECRET;
  const gotSecret      = req.headers['x-guavo-webhook-secret'] || req.headers['X-Guavo-Webhook-Secret'];
  if (!expectedSecret) {
    return res.status(500).json({ ok: false, error: 'MONDAY_WEBHOOK_SECRET is not set on the server.' });
  }
  if (gotSecret !== expectedSecret) {
    return res.status(401).json({ ok: false, error: 'Bad or missing webhook secret.' });
  }

  const event = body.event || body;
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
  const declineReason = (cols[COL.DECLINE_REASON]?.text || '').trim();
  const currentStatus = (cols[COL.DECLINE_EMAIL_STATUS]?.text || '').trim();
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

  if (!declineReason) {
    await monday.postUpdate(itemId, 'Cannot send decline email: <strong>Decline Reason</strong> column is empty.').catch(noop);
    return res.status(200).json({ ok: true, skipped: 'no-reason' });
  }

  const template = templates[declineReason];
  if (!template) {
    await monday.postUpdate(itemId,
      `Decline Reason "<strong>${common.escapeHtml(declineReason)}</strong>" has no template mapped — this is treated as a non-adverse-action close. No email sent. If this reason SHOULD send an applicant notice, add it to <code>lib/decline-templates/index.js</code>.`
    ).catch(noop);
    return res.status(200).json({ ok: true, skipped: 'unmapped-reason', declineReason });
  }

  if (!applicantEmail || !applicantEmail.includes('@')) {
    await monday.postUpdate(itemId, 'Cannot send decline email: applicant <strong>Email</strong> column is empty or invalid.').catch(noop);
    return res.status(200).json({ ok: true, skipped: 'no-email' });
  }

  // State gate — fail closed on any unlisted or blank state.
  if (!businessState) {
    await monday.postUpdate(itemId, 'Cannot send decline email: <strong>Business State</strong> is empty. Populate it and re-click.').catch(noop);
    return res.status(200).json({ ok: true, skipped: 'no-state' });
  }
  if (!common.isStateApproved(businessState)) {
    await monday.postUpdate(itemId,
      `Cannot send decline email: Business State "<strong>${common.escapeHtml(businessState)}</strong>" is not on the counsel-approved states list yet. Please send this decline manually while counsel reviews wording for this state.`
    ).catch(noop);
    return res.status(200).json({ ok: true, skipped: 'state-not-approved', businessState });
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

  const missing = template.missingFields(templateCtx);
  if (missing.length > 0) {
    await monday.postUpdate(itemId,
      `Cannot send <strong>${common.escapeHtml(declineReason)}</strong> decline email — missing required field${missing.length > 1 ? 's' : ''}: <strong>${missing.map(common.escapeHtml).join(', ')}</strong>. Populate and re-click the button.`
    ).catch(noop);
    return res.status(200).json({ ok: true, skipped: 'missing-fields', missing });
  }

  const rendered = template.build(templateCtx);

  // -- Send via Resend. --

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    await monday.postUpdate(itemId, 'Cannot send decline email: server missing RESEND_API_KEY.').catch(noop);
    return res.status(500).json({ ok: false, error: 'Email service not configured.' });
  }

  // Threading — populate In-Reply-To / References only when we captured the
  // Message-ID at ack time. Older items (or the current period before the
  // submit-application.js companion edit ships) fall through to a fresh
  // email; the subject stays the same either way so future threading joins
  // cleanly.
  const headers = {};
  if (ackMessageId) {
    // RFC 5322 Message-IDs are angle-bracket-wrapped. Accept either form on
    // input; always emit wrapped.
    const wrapped = ackMessageId.startsWith('<') ? ackMessageId : `<${ackMessageId}>`;
    headers['In-Reply-To'] = wrapped;
    headers['References']  = wrapped;
  }

  let resendId = null;
  let sendErr  = null;
  try {
    const payload = {
      from:     FROM_ADDR,
      to:       [applicantEmail],
      reply_to: REPLY_TO,
      subject:  ackMessageId ? `Re: ${rendered.subject}` : rendered.subject,
      html:     rendered.html,
      text:     rendered.text,
    };
    if (Object.keys(headers).length > 0) payload.headers = headers;

    const resp = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      sendErr = `Resend HTTP ${resp.status}: ${errText.slice(0, 500)}`;
    } else {
      const data = await resp.json().catch(() => ({}));
      resendId = data.id || null;
    }
  } catch (err) {
    sendErr = `Resend threw: ${err.message || err}`;
  }

  if (sendErr) {
    await monday.updateStatusLabel(itemId, COL.DECLINE_EMAIL_STATUS, STATUS.ERROR).catch(noop);
    await monday.postUpdate(itemId, `<strong>Decline email failed to send</strong>: ${common.escapeHtml(sendErr)}`).catch(noop);
    return res.status(502).json({ ok: false, error: sendErr });
  }

  // -- Mark item as sent + write audit trail. --

  try {
    await monday.updateStatusLabel(itemId, COL.DECLINE_EMAIL_STATUS, STATUS.SENT);
  } catch (err) {
    // Non-fatal — the email already went. Surface the failure in an Update.
    await monday.postUpdate(itemId,
      `Sent, but could not update Decline Email Status: ${common.escapeHtml(err.message || String(err))}.`
    ).catch(noop);
  }

  try {
    await monday.postUpdate(itemId,
      renderAuditUpdate({
        declineReason,
        applicantEmail,
        resendId,
        threaded: !!ackMessageId,
        sentAt: new Date().toISOString(),
        html: rendered.html,
      })
    );
  } catch (_err) { /* audit-trail failure is non-fatal */ }

  return res.status(200).json({
    ok:       true,
    sent:     true,
    resendId,
    threaded: !!ackMessageId,
    to:       applicantEmail,
    reason:   declineReason,
  });
};

// -- Helpers --

function noop() { /* swallow non-fatal Update failures */ }

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

function renderAuditUpdate({ declineReason, applicantEmail, resendId, threaded, sentAt, html }) {
  return [
    `<p><strong>Decline email sent</strong> to ${common.escapeHtml(applicantEmail)}</p>`,
    `<p>Sent at: <strong>${common.escapeHtml(sentAt)}</strong></p>`,
    `<p>Reason: <strong>${common.escapeHtml(declineReason)}</strong>. From: patti@guavo.com. Threaded: ${threaded ? 'yes' : 'no (fresh email)'}. Resend id: <code>${common.escapeHtml(resendId || 'none')}</code>.</p>`,
    `<details><summary>Rendered HTML (click to expand)</summary>${html}</details>`,
  ].join('');
}
