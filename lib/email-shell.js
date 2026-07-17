// Minimal shared helpers for outbound-email templates that are NOT decline
// notices. Decline templates use their own richer common.js because they
// carry regulated blocks (ECOA / FCRA / state overlay); the outbound-comms
// templates share only the visual shell.

const PALETTE = {
  green:   '#003724',
  ink:     '#141210',
  muted:   '#6B6358',
  callout: '#F2EDE5',
  divider: '#D4CCBF',
};

const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Wrap a body-HTML fragment in the standard Guavo email shell (subject-like
// heading, brand green H2, footer with Patti's contact). Body content should
// use <p style="margin:0 0 14px;"> for paragraph spacing.
function emailShell({ heading, subheading, bodyHtml }) {
  return `<!doctype html>
<html><body style="font-family:${FONT_STACK};color:${PALETTE.ink};line-height:1.55;max-width:640px;margin:0 auto;padding:24px;">
  <h2 style="font-size:20px;color:${PALETTE.green};margin:0 0 4px;font-weight:500;">${escapeHtml(heading)}</h2>
  ${subheading ? `<p style="color:${PALETTE.muted};font-size:13px;margin:0 0 20px;">${escapeHtml(subheading)}</p>` : '<div style="margin-bottom:20px;"></div>'}

  ${bodyHtml}

  <p style="margin:0 0 4px;">Warmly,</p>
  <p style="margin:0 0 2px;font-weight:500;">Patti</p>
  <p style="margin:0 0 20px;font-size:13px;color:${PALETTE.muted};">Guavo</p>

  <hr style="border:none;border-top:1px solid ${PALETTE.divider};margin:20px 0;">
  <p style="font-size:11px;color:${PALETTE.muted};margin:0;">Guavo Inc. &nbsp;|&nbsp; patti@guavo.com &nbsp;|&nbsp; (714) 400-2237 &nbsp;|&nbsp; Miami, FL</p>
</body></html>`;
}

function textShell({ heading, bodyLines }) {
  const lines = [
    heading,
    '',
    ...bodyLines,
    '',
    'Warmly,',
    'Patti',
    'Guavo',
    '',
    'Guavo Inc. | patti@guavo.com | (714) 400-2237 | Miami, FL',
  ];
  return lines.join('\n');
}

module.exports = {
  PALETTE,
  FONT_STACK,
  escapeHtml,
  emailShell,
  textShell,
};
