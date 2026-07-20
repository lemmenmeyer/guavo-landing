// Vercel Serverless Function — POST /api/submit-application
//
// Receives an application-form submission from the guavo.com client and does
// three things in one round trip:
//   1. Sends a broker-facing email to apply@guavo.com (or RESEND_TO) via
//      Resend, with the application PDF + government ID + any bank statements
//      attached. This is the authoritative record — if it fails, the response
//      is 502 and the applicant is asked to retry.
//   2. Creates a Monday item on the Guavo Pipeline board with every business
//      + owner column pre-populated from the client's pre-split payload, then
//      uploads the app PDF + ID + bank statements to the corresponding file
//      columns. Best-effort — if any Monday step fails the request still
//      returns 200 with monday_status: 'failed' in the response, and the
//      broker can recover via the /guavo-intake Mode B (Gmail fallback).
//   3. Sends the applicant a confirmation email with the app PDF attached.
//      Best-effort — see applicant_email_status in the response.
//
// The Monday step deliberately runs AFTER Resend #1 (which gates the response
// on the broker email arriving) so a Monday outage never prevents Guavo from
// receiving the application email.
//
// Env vars (set these in Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY    — starts with re_..., from resend.com/api-keys
//   RESEND_FROM       — optional; the "From" address. Defaults to
//                       "Guavo Applications <contact@guavo.com>", which
//                       works because guavo.com is verified in Resend. Override
//                       only if you want a different display name / address.
//   RESEND_TO         — optional; recipient. Defaults to apply@guavo.com.
//                       IMPORTANT: if you previously set RESEND_TO to
//                       contact@guavo.com in Vercel, update it (or unset it)
//                       so the new apply@ default takes effect.
//   MONDAY_API_TOKEN  — Personal API token from staura.monday.com/admin/api-section.
//                       Missing token → Monday step is skipped and
//                       monday_status: 'skipped' is returned. This is fine for
//                       staging; production should always have it set.
//
// Client contract (POST body, JSON):
//   {
//     to_email:        string,   // recipient — usually apply@guavo.com
//     applicant_name:  string,   // composed "First Last" for Resend display
//     business_name:   string,
//     applicant_email: string,
//     amount:          string,   // display-formatted, e.g. "$40,000"
//     submitted_at:    string,
//     ip_address:      string,
//     ref_id:          string,   // e.g. "GVA-ABC12345"
//     signature:       string,   // typed name
//     summary:         string,   // plain-text summary body
//     application_pdf: { filename, content: base64 },
//     government_id:   { filename, content_type, content: base64 },  // required
//     bank_statements: [ { filename, content_type, content: base64 }, ... ], // 0..4
//
//     // Pre-split structured payload used by the Monday integration.
//     // Every value comes straight from a discrete form input — no server-
//     // side name/address parsing.
//     business:  { legal_name, dba, entity_type, years_in_business, description,
//                  street, city, state, postal, phone, email },
//     owner:     { first_name, last_name, dob, ownership_pct, mobile_phone,
//                  ssn_last4, street, city, state, postal, email },
//     financing: { amount_requested, use_of_funds, monthly_revenue, notes }
//   }

const MAX_TOTAL_PAYLOAD_BYTES = 4_400_000; // stay under Vercel's 4.5 MB body cap
const MAX_ATTACHMENT_BYTES    = 2_500_000; // per-file cap in raw bytes (~2.5 MB)

// Guavo Pipeline board (staura.monday.com workspace 15919104).
// Column IDs are stable — changing any of these requires a Monday-side rename
// AND an update here.
const MONDAY = {
  API_URL:  'https://api.monday.com/v2',
  BOARD_ID: '18416816603',
  GROUP_ID: 'topics', // Active Pipeline group
  COLUMNS: {
    business_legal_name: 'text_mm44h259',
    business_state:      'text_mm444jzb',
    email:               'email_mm44bhsc',
    phone:               'phone_mm44x896',
    funded_amount:       'numeric_mm449dy9',
    date_received:       'date_mm44a5w2',
    stage:               'color_mm446jj4',
    source:              'color_mm4480kw',
    owner_first_name:    'text_mm5aa5wm',
    owner_last_name:     'text_mm5aa9t4',
    owner_dob:           'date_mm5acnen',
    owner_ssn_last4:     'text_mm5afbjq',
    owner_home_address:  'text_mm5aj924',
    owner_city:          'text_mm5aspds',
    owner_state:         'text_mm5aq8s6',
    owner_postal:        'text_mm5a9ysn',
    file_app_form:       'file_mm443rv4',
    file_id_document:    'file_mm5bh3a6',
    file_bank_statements:'file_mm5bkba',
  },
  STAGE_APP_FORM_LABEL: 'App Form',
  SOURCE_LABEL:         'App at Website',
};

module.exports = async function handler(req, res) {
  // CORS + method guards
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'Email service not configured (RESEND_API_KEY missing).' });
  }

  let body = req.body;
  // Vercel usually parses JSON automatically for application/json bodies,
  // but be defensive: if it arrives as a Buffer/string, parse it here.
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Missing request body.' });
  }

  const {
    to_email, applicant_name, business_name, applicant_email,
    amount, submitted_at, ip_address, ref_id, signature, summary,
    application_pdf, government_id, bank_statements,
    business, owner, financing
  } = body;

  // Minimal required-field validation
  const required = { applicant_name, business_name, applicant_email, amount, ref_id, signature, summary };
  for (const [k, v] of Object.entries(required)) {
    if (!v || typeof v !== 'string') {
      return res.status(400).json({ ok: false, error: `Missing required field: ${k}` });
    }
  }
  if (!application_pdf || !application_pdf.content) {
    return res.status(400).json({ ok: false, error: 'Missing application_pdf.content.' });
  }
  if (!government_id || !government_id.content || typeof government_id.content !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing government_id.content — a government-issued photo ID is required.' });
  }

  // Build the Resend attachments array
  const attachments = [];
  const appPdfBytes = approxBase64Bytes(application_pdf.content);
  if (appPdfBytes > MAX_ATTACHMENT_BYTES) {
    return res.status(413).json({ ok: false, error: 'Application PDF exceeds size limit.' });
  }
  attachments.push({
    filename: application_pdf.filename || `Guavo_Application_${ref_id}.pdf`,
    content: application_pdf.content,
  });

  const govIdBytes = approxBase64Bytes(government_id.content);
  if (govIdBytes > MAX_ATTACHMENT_BYTES) {
    return res.status(413).json({ ok: false, error: 'Government ID exceeds size limit.' });
  }
  const govIdRawName = government_id.filename || 'government_id';
  const govIdSafeName = govIdRawName.replace(/[^a-zA-Z0-9._-]/g, '_');
  attachments.push({
    filename: `00_government_id_${govIdSafeName}`,
    content: government_id.content,
  });

  let totalBytes = appPdfBytes + govIdBytes;
  const droppedStatements = []; // record any statement that arrived malformed
  if (Array.isArray(bank_statements)) {
    for (let i = 0; i < Math.min(4, bank_statements.length); i++) {
      const s = bank_statements[i];
      if (!s || !s.content || typeof s.content !== 'string' || s.content.length === 0) {
        // Never silently skip — record which slot arrived empty so we can
        // surface it to both the sender and the reviewer.
        droppedStatements.push({ slot: i + 1, filename: (s && s.filename) || '(no filename)' });
        continue;
      }
      const bytes = approxBase64Bytes(s.content);
      if (bytes > MAX_ATTACHMENT_BYTES) {
        return res.status(413).json({ ok: false, error: `Bank statement ${i + 1} exceeds ${Math.round(MAX_ATTACHMENT_BYTES / 1000_000)} MB.` });
      }
      if (totalBytes + bytes > MAX_TOTAL_PAYLOAD_BYTES) {
        return res.status(413).json({ ok: false, error: 'Total upload size too large — please compress files or upload fewer.' });
      }
      totalBytes += bytes;
      // Uniquify every statement filename so email clients (Gmail in
      // particular) don't dedupe attachments that share a name — banks
      // routinely export statements as "eStatement.pdf" for every month,
      // which caused a real 4-uploaded → 3-received bug in production.
      // Also prepend a human-readable month label so the reviewer can tell
      // which month is which at a glance.
      const monthLabels = ['most-recent-month', '1mo-prior', '2mo-prior', '3mo-prior'];
      const monthLabel = monthLabels[i] || `stmt${i + 1}`;
      const rawName = s.filename || 'bank_statement.pdf';
      // Strip filesystem-hostile chars but keep the extension.
      const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueName = `${String(i + 1).padStart(2, '0')}_${monthLabel}_${safeName}`;
      attachments.push({
        filename: uniqueName,
        content: s.content,
      });
    }
  }

  // Build the email
  const fromAddr = process.env.RESEND_FROM || 'Guavo Applications <contact@guavo.com>';
  const toAddr   = process.env.RESEND_TO   || to_email || 'apply@guavo.com';

  const statementCount = attachments.length - 2; // minus app PDF + government ID
  const subject = `New application — ${business_name} — ${amount}`;
  const html = renderHtmlBody({
    applicant_name, business_name, applicant_email, amount,
    submitted_at, ip_address, ref_id, signature, summary,
    statementCount, droppedStatements
  });
  const droppedNote = droppedStatements.length > 0
    ? `\n\n⚠ WARNING: ${droppedStatements.length} bank statement(s) arrived empty and were not attached: ${droppedStatements.map(d => `slot ${d.slot} (${d.filename})`).join(', ')}. Ask the applicant to re-upload.\n`
    : '';
  const text = summary + droppedNote + '\n\nReply directly to this email to reach the applicant.\n';

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddr,
      to: [toAddr],
      reply_to: applicant_email,
      subject,
      html,
      text,
      attachments,
    }),
  });

  if (!resendResp.ok) {
    const errText = await resendResp.text().catch(() => '');
    return res.status(502).json({ ok: false, error: `Resend rejected the request (${resendResp.status}).`, detail: errText.slice(0, 400) });
  }

  const data = await resendResp.json().catch(() => ({}));

  // ── Monday API — create the pipeline item with every column pre-filled,
  // then upload the app PDF + ID + bank statements to their file columns.
  // Best-effort: if any Monday call fails we still return 200 (the broker
  // email is the authoritative record and /guavo-intake Mode B can recover).
  let monday_status  = 'skipped';
  let monday_item_id = null;
  let monday_error   = null;
  const mondayToken  = process.env.MONDAY_API_TOKEN;
  if (mondayToken && business && owner) {
    try {
      monday_item_id = await mondayCreateItem({
        token: mondayToken,
        itemName: `New application — ${business_name} — ${amount}`,
        business, owner, financing, applicant_email, submitted_at, ref_id,
      });

      // File uploads run in parallel; the whole batch takes ~= slowest single
      // upload rather than sum-of-uploads.
      const uploads = [
        {
          columnId: MONDAY.COLUMNS.file_app_form,
          filename: application_pdf.filename || `Guavo_Application_${ref_id}.pdf`,
          contentB64: application_pdf.content,
        },
        {
          columnId: MONDAY.COLUMNS.file_id_document,
          filename: (government_id.filename || 'government_id').replace(/[^a-zA-Z0-9._-]/g, '_'),
          contentB64: government_id.content,
        },
      ];
      if (Array.isArray(bank_statements)) {
        const monthLabels = ['most-recent-month', '1mo-prior', '2mo-prior', '3mo-prior'];
        for (let i = 0; i < Math.min(4, bank_statements.length); i++) {
          const s = bank_statements[i];
          if (!s || !s.content) continue;
          const monthLabel = monthLabels[i] || `stmt${i + 1}`;
          const rawName = (s.filename || 'bank_statement.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
          uploads.push({
            columnId: MONDAY.COLUMNS.file_bank_statements,
            filename: `${String(i + 1).padStart(2, '0')}_${monthLabel}_${rawName}`,
            contentB64: s.content,
          });
        }
      }
      const uploadResults = await Promise.allSettled(uploads.map(u =>
        mondayUploadFile({
          token: mondayToken,
          itemId: monday_item_id,
          columnId: u.columnId,
          filename: u.filename,
          buffer: Buffer.from(u.contentB64, 'base64'),
        })
      ));
      const failedUploads = uploadResults.filter(r => r.status === 'rejected');
      if (failedUploads.length > 0) {
        monday_status = 'partial';
        monday_error = `Item created (id ${monday_item_id}) but ${failedUploads.length} of ${uploads.length} file uploads failed.`;
      } else {
        monday_status = 'ok';
      }
    } catch (err) {
      // Redact SSN Last 4 from any Monday-side error surface. The API rarely
      // echoes request bodies but the redact call is cheap insurance.
      monday_status = 'failed';
      monday_error = redactSensitive(err && err.message ? err.message : String(err), owner);
    }
  }

  // Applicant-facing confirmation email. Nice-to-have, not required — if it
  // fails we still return 200 so the applicant sees the success screen.
  // The broker copy at contact@guavo.com is the authoritative record.
  let applicant_email_status = 'skipped';
  let applicant_email_id = null;
  if (applicant_email && typeof applicant_email === 'string' && applicant_email.includes('@')) {
    try {
      const applicantResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddr,
          to: [applicant_email],
          reply_to: 'contact@guavo.com',
          subject: `Your Guavo application is under review (Ref ${ref_id})`,
          html: renderApplicantHtmlBody({
            applicant_name, business_name, amount, submitted_at, ref_id,
          }),
          text: renderApplicantTextBody({
            applicant_name, business_name, amount, submitted_at, ref_id,
          }),
          attachments: [
            {
              filename: application_pdf.filename || `Guavo_Application_${ref_id}.pdf`,
              content: application_pdf.content,
            },
          ],
        }),
      });
      if (applicantResp.ok) {
        const applicantData = await applicantResp.json().catch(() => ({}));
        applicant_email_status = 'sent';
        applicant_email_id = applicantData.id || null;
      } else {
        applicant_email_status = 'failed';
      }
    } catch {
      applicant_email_status = 'failed';
    }
  }

  return res.status(200).json({
    ok: true,
    id: data.id || null,
    attachment_count: attachments.length,
    attachment_names: attachments.map(a => a.filename),
    dropped_statements: droppedStatements,
    applicant_email_status,
    applicant_email_id,
    monday_status,
    monday_item_id,
    monday_error,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Monday API helpers
// ─────────────────────────────────────────────────────────────────────────────

// Creates the Pipeline item and populates every column from the pre-split
// client payload. Returns the new item id.
async function mondayCreateItem({ token, itemName, business, owner, financing, applicant_email, submitted_at, ref_id }) {
  const columnValues = {};
  const set = (colId, val) => { if (val !== undefined && val !== null && val !== '') columnValues[colId] = val; };
  const s   = (v) => (v == null ? '' : String(v).trim());

  set(MONDAY.COLUMNS.business_legal_name, s(business.legal_name || ''));
  // Email + phone columns require object-shaped values, not bare strings.
  // Monday rejects the whole mutation with "invalid value" otherwise, even
  // though the type hint (JSON) would suggest a string is fine.
  const em = s(applicant_email || owner.email || business.email || '');
  if (em) set(MONDAY.COLUMNS.email, { email: em, text: em });
  const ph = s(business.phone || owner.mobile_phone || '').replace(/[^\d+]/g, '');
  if (ph) set(MONDAY.COLUMNS.phone, { phone: ph, countryShortName: 'US' });
  set(MONDAY.COLUMNS.business_state,      s(business.state || '').toUpperCase().slice(0, 2));

  const amountNum = Number(String(financing && financing.amount_requested || '').replace(/[^\d.]/g, ''));
  if (Number.isFinite(amountNum) && amountNum > 0) set(MONDAY.COLUMNS.funded_amount, amountNum);

  set(MONDAY.COLUMNS.date_received, { date: isoDate(submitted_at) });
  set(MONDAY.COLUMNS.stage,         { label: MONDAY.STAGE_APP_FORM_LABEL });
  set(MONDAY.COLUMNS.source,        { label: MONDAY.SOURCE_LABEL });

  set(MONDAY.COLUMNS.owner_first_name,   s(owner.first_name));
  set(MONDAY.COLUMNS.owner_last_name,    s(owner.last_name));
  if (owner.dob)         set(MONDAY.COLUMNS.owner_dob, { date: s(owner.dob) });
  if (owner.ssn_last4)   set(MONDAY.COLUMNS.owner_ssn_last4, s(owner.ssn_last4));
  set(MONDAY.COLUMNS.owner_home_address, s(owner.street));
  set(MONDAY.COLUMNS.owner_city,         s(owner.city));
  set(MONDAY.COLUMNS.owner_state,        s(owner.state).toUpperCase().slice(0, 2));
  set(MONDAY.COLUMNS.owner_postal,       s(owner.postal));

  const mutation = `mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
    create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
  }`;
  const variables = {
    boardId: MONDAY.BOARD_ID,
    groupId: MONDAY.GROUP_ID,
    itemName,
    columnValues: JSON.stringify(columnValues),
  };

  const resp = await fetch(MONDAY.API_URL, {
    method: 'POST',
    headers: {
      'Authorization': token,
      'API-Version': '2024-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: mutation, variables }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json.errors) {
    const msg = json.errors ? json.errors.map(e => e.message).join('; ') : `HTTP ${resp.status}`;
    throw new Error(`create_item failed: ${msg}`);
  }
  const id = json.data && json.data.create_item && json.data.create_item.id;
  if (!id) throw new Error('create_item returned no id.');
  return id;
}

// Uploads a single Buffer to a file column via Monday's multipart file endpoint.
// Uses graphql-multipart-request-spec (operations + map + file part).
async function mondayUploadFile({ token, itemId, columnId, filename, buffer }) {
  const mutation = `mutation ($file: File!) {
    add_file_to_column(item_id: ${itemId}, column_id: "${columnId}", file: $file) { id }
  }`;
  const form = new FormData();
  form.append('query', mutation);
  form.append('variables[file]', new Blob([buffer]), filename);

  const resp = await fetch(MONDAY.API_URL + '/file', {
    method: 'POST',
    headers: { 'Authorization': token, 'API-Version': '2024-01' },
    body: form,
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json.errors) {
    const msg = json.errors ? json.errors.map(e => e.message).join('; ') : `HTTP ${resp.status}`;
    throw new Error(`add_file_to_column (${columnId}, ${filename}) failed: ${msg}`);
  }
  return json.data && json.data.add_file_to_column && json.data.add_file_to_column.id;
}

// Normalize "July 15, 2026 at 6:23:44 PM EDT" or an ISO string to YYYY-MM-DD
// for Monday's date column. Falls back to today if the input is unparseable.
function isoDate(input) {
  const d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

// Strip SSN Last 4 (and only SSN Last 4) from any string that would surface in
// a response or a log. The token is highly identifiable; other PII is already
// visible to the ops team on Monday so redacting it here would be theater.
function redactSensitive(text, owner) {
  if (!text) return text;
  const ssn = owner && owner.ssn_last4 ? String(owner.ssn_last4).trim() : '';
  if (ssn && /^\d{4}$/.test(ssn)) {
    return String(text).split(ssn).join('****');
  }
  return String(text);
}

// Approximate raw byte count from a base64 string length.
function approxBase64Bytes(b64) {
  if (typeof b64 !== 'string') return 0;
  const len = b64.length;
  // Remove up to 2 padding "=" chars
  let pad = 0;
  if (b64.endsWith('==')) pad = 2;
  else if (b64.endsWith('='))  pad = 1;
  return Math.floor((len * 3) / 4) - pad;
}

function renderHtmlBody({ applicant_name, business_name, applicant_email, amount, submitted_at, ip_address, ref_id, signature, summary, statementCount, droppedStatements }) {
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const droppedHtml = (droppedStatements && droppedStatements.length > 0)
    ? `<div style="background:#FEE7E1;border-left:3px solid #C85840;padding:12px 14px;margin:0 0 16px;border-radius:3px;font-size:13.5px;color:#003724;">
         <strong>⚠ ${droppedStatements.length} bank statement(s) arrived empty and are NOT attached:</strong><br>
         ${droppedStatements.map(d => `slot ${esc(String(d.slot))} — ${esc(d.filename)}`).join('<br>')}
         <br><br>Please ask the applicant to re-upload these statements.
       </div>`
    : '';
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a16;line-height:1.55;max-width:640px;margin:0 auto;padding:24px;">
  <h2 style="font-size:20px;color:#003724;margin:0 0 4px;">New Financing Application</h2>
  <p style="color:#6B6358;font-size:13px;margin:0 0 20px;">Received via guavo.com &nbsp;|&nbsp; Ref: <strong>${esc(ref_id)}</strong></p>
  ${droppedHtml}
  <table style="width:100%;font-size:14px;border-collapse:collapse;margin-bottom:18px;">
    <tr><td style="padding:6px 0;color:#6B6358;width:170px;">Business</td><td style="padding:6px 0;"><strong>${esc(business_name)}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#6B6358;">Owner / Guarantor</td><td style="padding:6px 0;">${esc(applicant_name)}</td></tr>
    <tr><td style="padding:6px 0;color:#6B6358;">Amount Requested</td><td style="padding:6px 0;"><strong>${esc(amount)}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#6B6358;">Applicant Email</td><td style="padding:6px 0;"><a href="mailto:${esc(applicant_email)}">${esc(applicant_email)}</a></td></tr>
    <tr><td style="padding:6px 0;color:#6B6358;">Submitted</td><td style="padding:6px 0;">${esc(submitted_at)}</td></tr>
    <tr><td style="padding:6px 0;color:#6B6358;">IP Address</td><td style="padding:6px 0;">${esc(ip_address || '—')}</td></tr>
    <tr><td style="padding:6px 0;color:#6B6358;">Electronic Signature</td><td style="padding:6px 0;">${esc(signature)}</td></tr>
  </table>
  <p style="font-size:13px;color:#003724;background:#F2EDE5;padding:12px 14px;border-radius:4px;margin:0 0 20px;">
    <strong>Attached:</strong> Full signed application PDF, government-issued photo ID${statementCount > 0 ? `, plus ${statementCount} bank statement${statementCount === 1 ? '' : 's'}` : ''}. Forward this email directly to brokers/banks — the PDF carries through cleanly.
  </p>
  <pre style="font-family:Consolas,Monaco,'Courier New',monospace;font-size:12px;background:#FAF8F4;padding:14px;border-radius:4px;white-space:pre-wrap;color:#1a1a16;border:1px solid #D4CCBF;">${esc(summary)}</pre>
  <p style="font-size:12px;color:#6B6358;margin-top:20px;">Reply directly to this email to reach the applicant.</p>
  <hr style="border:none;border-top:1px solid #D4CCBF;margin:20px 0;">
  <p style="font-size:11px;color:#6B6358;margin:0;">Guavo Inc. &nbsp;|&nbsp; contact@guavo.com &nbsp;|&nbsp; (714) 400-2237 &nbsp;|&nbsp; Miami, FL</p>
</body></html>`;
}

function renderApplicantHtmlBody({ applicant_name, business_name, amount, submitted_at, ref_id }) {
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const firstName = String(applicant_name || '').trim().split(/\s+/)[0] || 'there';
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a16;line-height:1.55;max-width:640px;margin:0 auto;padding:24px;">
  <h2 style="font-size:20px;color:#003724;margin:0 0 4px;font-weight:500;">Your application is under review</h2>
  <p style="color:#6B6358;font-size:13px;margin:0 0 20px;">Received via guavo.com &nbsp;|&nbsp; Ref: <strong style="font-weight:500;">${esc(ref_id)}</strong></p>
  <p style="margin:0 0 14px;">Hi ${esc(firstName)},</p>
  <p style="margin:0 0 14px;">Thank you for applying for financing with Guavo. We received your application for <strong style="font-weight:500;">${esc(business_name)}</strong> and it is now under review by our team.</p>
  <table style="width:100%;font-size:14px;border-collapse:collapse;margin:0 0 18px;">
    <tr><td style="padding:6px 0;color:#6B6358;width:170px;">Business</td><td style="padding:6px 0;">${esc(business_name)}</td></tr>
    <tr><td style="padding:6px 0;color:#6B6358;">Amount requested</td><td style="padding:6px 0;">${esc(amount)}</td></tr>
    <tr><td style="padding:6px 0;color:#6B6358;">Submitted</td><td style="padding:6px 0;">${esc(submitted_at)}</td></tr>
    <tr><td style="padding:6px 0;color:#6B6358;">Reference</td><td style="padding:6px 0;">${esc(ref_id)}</td></tr>
  </table>
  <p style="font-size:13px;color:#003724;background:#F2EDE5;padding:12px 14px;border-radius:4px;margin:0 0 20px;">
    A signed copy of your application PDF is attached to this email for your records.
  </p>
  <p style="margin:0 0 14px;">We aim to respond within one business day. In the meantime, feel free to reply to this email if you have questions or want to add supporting documents.</p>
  <p style="margin:0 0 4px;">Talk soon,</p>
  <p style="margin:0 0 20px;">The Guavo team</p>
  <hr style="border:none;border-top:1px solid #D4CCBF;margin:20px 0;">
  <p style="font-size:11px;color:#6B6358;margin:0;">Guavo Inc. &nbsp;|&nbsp; contact@guavo.com &nbsp;|&nbsp; Miami, FL</p>
</body></html>`;
}

function renderApplicantTextBody({ applicant_name, business_name, amount, submitted_at, ref_id }) {
  const firstName = String(applicant_name || '').trim().split(/\s+/)[0] || 'there';
  return [
    'Your application is under review',
    `Ref: ${ref_id}`,
    '',
    `Hi ${firstName},`,
    '',
    `Thank you for applying for financing with Guavo. We received your application for ${business_name} and it is now under review by our team.`,
    '',
    `Business: ${business_name}`,
    `Amount requested: ${amount}`,
    `Submitted: ${submitted_at}`,
    `Reference: ${ref_id}`,
    '',
    'A signed copy of your application PDF is attached to this email for your records.',
    '',
    'We aim to respond within one business day. In the meantime, feel free to reply to this email if you have questions or want to add supporting documents.',
    '',
    'Talk soon,',
    'The Guavo team',
    '',
    'Guavo Inc. | contact@guavo.com | Miami, FL',
  ].join('\n');
}
