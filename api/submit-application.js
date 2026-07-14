// Vercel Serverless Function — POST /api/submit-application
//
// Receives an application-form submission from the guavo.com client,
// sends the recipient email (with the application PDF + any uploaded
// bank statements as attachments) via Resend, and returns JSON.
//
// Env vars (set these in Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY   — starts with re_..., from resend.com/api-keys
//   RESEND_FROM      — optional; the "From" address. Defaults to
//                      "Guavo Applications <applications@guavo.com>", which
//                      works because guavo.com is verified in Resend. Override
//                      only if you want a different display name / address.
//   RESEND_TO        — optional; recipient. Defaults to contact@guavo.com.
//
// Client contract (POST body, JSON):
//   {
//     to_email:        string,   // recipient — usually contact@guavo.com
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
    application_pdf, bank_statements
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

  let totalBytes = appPdfBytes;
  if (Array.isArray(bank_statements)) {
    for (let i = 0; i < Math.min(4, bank_statements.length); i++) {
      const s = bank_statements[i];
      if (!s || !s.content) continue;
      const bytes = approxBase64Bytes(s.content);
      if (bytes > MAX_ATTACHMENT_BYTES) {
        return res.status(413).json({ ok: false, error: `Bank statement ${i + 1} exceeds ${Math.round(MAX_ATTACHMENT_BYTES / 1000_000)} MB.` });
      }
      if (totalBytes + bytes > MAX_TOTAL_PAYLOAD_BYTES) {
        return res.status(413).json({ ok: false, error: 'Total upload size too large — please compress files or upload fewer.' });
      }
      totalBytes += bytes;
      attachments.push({
        filename: s.filename || `bank_statement_${i + 1}`,
        content: s.content,
      });
    }
  }

  // Build the email
  const fromAddr = process.env.RESEND_FROM || 'Guavo Applications <applications@guavo.com>';
  const toAddr   = process.env.RESEND_TO   || to_email || 'contact@guavo.com';

  const subject = `New application — ${business_name} — ${amount}`;
  const html = renderHtmlBody({ applicant_name, business_name, applicant_email, amount, submitted_at, ip_address, ref_id, signature, summary, hasStatements: attachments.length > 1 });
  const text = summary + '\n\nReply directly to this email to reach the applicant.\n';

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
  return res.status(200).json({ ok: true, id: data.id || null, attachment_count: attachments.length });
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

function renderHtmlBody({ applicant_name, business_name, applicant_email, amount, submitted_at, ip_address, ref_id, signature, summary, hasStatements }) {
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a16;line-height:1.55;max-width:640px;margin:0 auto;padding:24px;">
  <h2 style="font-size:20px;color:#003724;margin:0 0 4px;">New Financing Application</h2>
  <p style="color:#6B6358;font-size:13px;margin:0 0 20px;">Received via guavo.com &nbsp;|&nbsp; Ref: <strong>${esc(ref_id)}</strong></p>
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
    <strong>Attached:</strong> Full signed application PDF${hasStatements ? ' + uploaded bank statements' : ''}. Forward this email directly to brokers/banks — the PDF carries through cleanly.
  </p>
  <pre style="font-family:Consolas,Monaco,'Courier New',monospace;font-size:12px;background:#FAF8F4;padding:14px;border-radius:4px;white-space:pre-wrap;color:#1a1a16;border:1px solid #D4CCBF;">${esc(summary)}</pre>
  <p style="font-size:12px;color:#6B6358;margin-top:20px;">Reply directly to this email to reach the applicant.</p>
  <hr style="border:none;border-top:1px solid #D4CCBF;margin:20px 0;">
  <p style="font-size:11px;color:#6B6358;margin:0;">Guavo Inc. &nbsp;|&nbsp; contact@guavo.com &nbsp;|&nbsp; (714) 400-2237 &nbsp;|&nbsp; Miami, FL</p>
</body></html>`;
}
