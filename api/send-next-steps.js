// Vercel Serverless Function — POST /api/send-next-steps
//
// Triggered by a Monday "When button is clicked, send webhook" automation on
// the Send Next Steps Email button column. Reads the item's Next Steps label
// and fires the matching template from lib/next-steps-templates/.
//
// Sibling to /api/send-decline but with a distinct status column and template
// registry. Decline emails carry regulated ECOA/FCRA blocks; next-steps
// emails are lighter-weight applicant comms (unlock Experian, get broker
// consent, generic follow-up, etc.) and share only the visual shell.
//
// Env vars (shared with /api/send-decline):
//   RESEND_API_KEY
//   MONDAY_API_TOKEN
//   MONDAY_WEBHOOK_SECRET

const templates = require('../lib/next-steps-templates');
const shell     = require('../lib/email-shell');
const monday    = require('../lib/monday-client');

const COL = {
  NEXT_STEPS:            'color_mm44sz50',
  NEXT_STEPS_EMAIL_STATUS: 'color_mm5bntef',
  STAGE:                 'color_mm446jj4',
  APPLICANT_EMAIL:       'email_mm44bhsc',
  BUSINESS_LEGAL_NAME:   'text_mm44h259',
  OWNER_FIRST_NAME:      'text_mm5aa5wm',
  OWNER_LAST_NAME:       'text_mm5aa9t4',
  FUNDED_AMOUNT:         'numeric_mm449dy9',
  ACK_MESSAGE_ID:        'text_mm5bhzr9',
};

const STATUS = {
  NOT_SENT:    'Not sent',
  SENT:        'Sent',
  BOUNCED:     'Bounced',
  ERROR:       'Error',
  NO_TEMPLATE: 'No template',
};

const SENDABLE_STATUSES = new Set([STATUS.NOT_SENT, STATUS.NO_TEMPLATE, '', null, undefined]);

const FROM_ADDR = 'Patti at Guavo <patti@guavo.com>';
const REPLY_TO  = 'patti@guavo.com';

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

  // Monday webhook registration challenge.
  if (body.challenge) return res.status(200).json({ challenge: body.challenge });

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
  if (!itemId) return res.status(400).json({ ok: false, error: 'Webhook payload had no pulseId.' });

  let item;
  try {
    item = await monday.fetchItem(itemId);
  } catch (err) {
    return res.status(502).json({ ok: false, error: `Monday fetch failed: ${err.message || err}` });
  }
  if (!item) return res.status(404).json({ ok: false, error: `Item ${itemId} not found.` });

  const cols = item.columns || {};
  const nextStepsLabel = (cols[COL.NEXT_STEPS]?.text || '').trim();
  const currentStatus  = (cols[COL.NEXT_STEPS_EMAIL_STATUS]?.text || '').trim();
  const applicantEmail = (cols[COL.APPLICANT_EMAIL]?.text || '').trim();
  const businessName   = (cols[COL.BUSINESS_LEGAL_NAME]?.text || '').trim();
  const ownerFirst     = (cols[COL.OWNER_FIRST_NAME]?.text || '').trim();
  const ownerLast      = (cols[COL.OWNER_LAST_NAME]?.text || '').trim();
  const amountRaw      = (cols[COL.FUNDED_AMOUNT]?.text || '').trim();
  const ackMessageId   = (cols[COL.ACK_MESSAGE_ID]?.text || '').trim();

  // Bank-statement detection — used by get-broker-consent template to decide
  // whether to ask for them. Heuristic: any item asset whose filename does not
  // look like the application PDF or an ID.
  const hasBankStatements = (item.assets || []).some(a => {
    const n = String(a.name || '').toLowerCase();
    if (!n) return false;
    if (n.includes('application') || n.startsWith('guavo_application')) return false;
    if (n.includes('government_id') || n.includes('driver') || n.includes('passport')) return false;
    return n.endsWith('.pdf');
  });

  if (!SENDABLE_STATUSES.has(currentStatus)) {
    await monday.postUpdate(itemId,
      `Next-steps email already sent (Next Steps Email Status = <strong>${shell.escapeHtml(currentStatus)}</strong>). Reset the status to "Not sent" if you intend to send another one.`
    ).catch(noop);
    return res.status(200).json({ ok: true, skipped: 'already-handled', currentStatus });
  }

  if (!nextStepsLabel) {
    await monday.postUpdate(itemId, 'Cannot send next-steps email: <strong>Next Steps</strong> column is empty.').catch(noop);
    return res.status(200).json({ ok: true, skipped: 'no-next-step' });
  }

  const template = templates[nextStepsLabel];
  if (!template) {
    await monday.updateStatusLabel(itemId, COL.NEXT_STEPS_EMAIL_STATUS, STATUS.NO_TEMPLATE).catch(noop);
    await monday.postUpdate(itemId,
      `Next Steps label "<strong>${shell.escapeHtml(nextStepsLabel)}</strong>" has no email template mapped, so no applicant email was sent. Available templates: ${Object.keys(templates).map(k => `"${shell.escapeHtml(k)}"`).join(', ')}. Add a new template file under <code>lib/next-steps-templates/</code> and register it in <code>index.js</code> if this step should send.`
    ).catch(noop);
    return res.status(200).json({ ok: true, skipped: 'unmapped-label', nextStepsLabel });
  }

  if (!applicantEmail || !applicantEmail.includes('@')) {
    await monday.postUpdate(itemId, 'Cannot send next-steps email: applicant <strong>Email</strong> column is empty or invalid.').catch(noop);
    return res.status(200).json({ ok: true, skipped: 'no-email' });
  }

  const amountRequested = amountRaw ? formatAmount(amountRaw) : '';
  const ownerFullName   = [ownerFirst, ownerLast].filter(Boolean).join(' ').trim();
  const refId           = extractRefId(item.name);

  const templateCtx = {
    ownerFirstName: ownerFirst,
    ownerFullName,
    businessName,
    amountRequested,
    refId,
    hasBankStatements,
  };

  const missing = template.missingFields(templateCtx);
  if (missing.length > 0) {
    await monday.postUpdate(itemId,
      `Cannot send "${shell.escapeHtml(nextStepsLabel)}" email. Missing required field${missing.length > 1 ? 's' : ''}: <strong>${missing.map(shell.escapeHtml).join(', ')}</strong>. Populate and re-click.`
    ).catch(noop);
    return res.status(200).json({ ok: true, skipped: 'missing-fields', missing });
  }

  const rendered = template.build(templateCtx);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    await monday.postUpdate(itemId, 'Cannot send next-steps email: server missing RESEND_API_KEY.').catch(noop);
    return res.status(500).json({ ok: false, error: 'Email service not configured.' });
  }

  const headers = {};
  if (ackMessageId) {
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
    await monday.updateStatusLabel(itemId, COL.NEXT_STEPS_EMAIL_STATUS, STATUS.ERROR).catch(noop);
    await monday.postUpdate(itemId, `<strong>Next-steps email failed to send</strong>: ${shell.escapeHtml(sendErr)}`).catch(noop);
    return res.status(502).json({ ok: false, error: sendErr });
  }

  try {
    await monday.updateStatusLabel(itemId, COL.NEXT_STEPS_EMAIL_STATUS, STATUS.SENT);
  } catch (err) {
    await monday.postUpdate(itemId,
      `Sent, but could not update Next Steps Email Status: ${shell.escapeHtml(err.message || String(err))}.`
    ).catch(noop);
  }

  try {
    await monday.postUpdate(itemId, renderAuditUpdate({
      nextStepsLabel,
      applicantEmail,
      resendId,
      threaded: !!ackMessageId,
      sentAt: new Date().toISOString(),
      html: rendered.html,
    }));
  } catch (_err) { /* audit failure is non-fatal */ }

  return res.status(200).json({
    ok:       true,
    sent:     true,
    resendId,
    threaded: !!ackMessageId,
    to:       applicantEmail,
    nextStep: nextStepsLabel,
  });
};

// -- Helpers --

function noop() { /* swallow non-fatal Update failures */ }

// Extract the "GVA-XXXXX" reference id from the forwarded item name. The
// intake email arrives as "Fwd: New Application: <biz> - GVA-XXXXX" or
// "New application — <biz> — $Amount" depending on which form path fired, so
// this is best-effort — return empty if not found and let the template omit
// the ref line.
function extractRefId(itemName) {
  const m = String(itemName || '').match(/GVA-[A-Z0-9]+/);
  return m ? m[0] : '';
}

// Monday numeric columns store the raw number in .text with no unit. The
// board's Funded Amount column is configured with a $ prefix but that display
// unit doesn't appear in the API response, so we format ourselves.
function formatAmount(raw) {
  const n = Number(String(raw).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function renderAuditUpdate({ nextStepsLabel, applicantEmail, resendId, threaded, sentAt, html }) {
  return [
    `<p><strong>Next-steps email sent</strong> to ${shell.escapeHtml(applicantEmail)}</p>`,
    `<p>Sent at: <strong>${shell.escapeHtml(sentAt)}</strong></p>`,
    `<p>Next Steps: <strong>${shell.escapeHtml(nextStepsLabel)}</strong>. From: patti@guavo.com. Threaded: ${threaded ? 'yes' : 'no (fresh email)'}. Resend id: <code>${shell.escapeHtml(resendId || 'none')}</code>.</p>`,
    `<details><summary>Rendered HTML (click to expand)</summary>${html}</details>`,
  ].join('');
}
