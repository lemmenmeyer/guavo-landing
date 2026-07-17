// Vercel Serverless Function — POST /api/submit-application
//
// Receives an application-form submission from the guavo.com client and
// sends two emails via Resend:
//   1. A broker-facing email to apply@guavo.com (or RESEND_TO) with the
//      application PDF + any uploaded bank statements attached. From apply@
//      the Google Group forwards to the Monday Pipeline board's "Email to
//      board" address, which auto-creates an item in the Webpage Pipeline
//      group with every attachment on the App form file column.
//   2. An applicant-facing confirmation email to `applicant_email` with only
//      the application PDF attached. This send is best-effort — if it fails
//      the request still returns 200 (see applicant_email_status in the
//      response) so the applicant's success screen isn't blocked by a bad
//      address or a Resend hiccup.
//
// Env vars (set these in Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY   — starts with re_..., from resend.com/api-keys
//   RESEND_FROM      — optional; the "From" address. Defaults to
//                      "Guavo Applications <contact@guavo.com>", which
//                      works because guavo.com is verified in Resend. Override
//                      only if you want a different display name / address.
//   RESEND_TO        — optional; recipient. Defaults to apply@guavo.com.
//                      IMPORTANT: if you previously set RESEND_TO to
//                      contact@guavo.com in Vercel, update it (or unset it)
//                      so the new apply@ default takes effect.
//
// Client contract (POST body, JSON):
//   {
//     to_email:        string,   // recipient — usually apply@guavo.com
//     applicant_name:  string,
//     business_name:   string,
//     applicant_email: string,
//     amount:          string,   // display-formatted, e.g. "$40,000"
//     submitted_at:    string,
//     ip_address:      string,
//     ref_id:          string,   // e.g. "GVA-ABC12345"
//     signature:       string,   // typed name
//     summary:         string,   // plain-text summary body
//     application_pdf: {
//       filename: string,
//       content:  string,   // base64 (no "data:...;base64," prefix)
//     },
//     government_id: {          // required
//       filename: string,
//       content_type: string,
//       content: string,        // base64 (no "data:...;base64," prefix)
//     },
//     bank_statements: [        // 0..4 entries
//       { filename, content_type, content }, ...
//     ]
//   }

const MAX_TOTAL_PAYLOAD_BYTES = 4_400_000; // stay under Vercel's 4.5 MB body cap
const MAX_ATTACHMENT_BYTES    = 2_500_000; // per-file cap in raw bytes (~2.5 MB)

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
    application_pdf, government_id, bank_statements
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
  });
};

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
