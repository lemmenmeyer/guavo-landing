// Shared building blocks for Guavo decline-notice templates.
//
// Every per-reason template imports from this module. Rendering is done here
// so the ECOA notice, FCRA §615(a) block, Experian address, and state overlays
// are guaranteed identical across templates — inconsistency across decline
// reasons creates fair-lending exposure under Reg B.
//
// Counsel review gates before first live send:
//   * APPROVED_STATES — starts EMPTY. Send-decline endpoint fails closed on
//     any state not in this set. Counsel adds states as they are cleared.
//   * stateOverlayBlock — per-state overlay paragraph counsel supplies when
//     a state requires additional wording (NY, CA, others as needed).
//   * Every text block in this file is a first-pass structure — counsel must
//     review and sign off on wording before removing the boss-approval gate.

const PALETTE = {
  green:      '#003724',
  ink:        '#1a1a16',
  muted:      '#6B6358',
  callout:    '#F2EDE5',
  divider:    '#D4CCBF',
  fcraStripe: '#F5F1EA',
  fcraBorder: '#B5A996',
};

const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

const EXPERIAN = {
  name:  'Experian',
  addr1: 'P.O. Box 4500',
  city:  'Allen',
  state: 'TX',
  zip:   '75013',
  phone: '1-888-397-3742',
  web:   'www.experian.com',
};

// Counsel-managed allowlist. Empty by default — this makes the endpoint fail
// closed on every state until counsel explicitly clears each one. Values are
// the exact strings that appear in the Business State column on Monday
// (2-letter code or full name — normalize before lookup via normalizeState()).
const APPROVED_STATES = new Set([
  // Counsel to populate. Examples once cleared:
  //   'FL', 'TX', 'GA',
]);

// Normalize a Monday text-column state string to the form used in the set.
// If Monday holds a mix of "Florida" and "FL", counsel decides which canonical
// form is used and this helper normalizes to it. Default: uppercase, trimmed;
// two-letter codes stay as codes; full names left as typed.
function normalizeState(s) {
  return String(s || '').trim().toUpperCase();
}

function isStateApproved(s) {
  return APPROVED_STATES.has(normalizeState(s));
}

// Per-state overlay paragraphs. Counsel supplies wording for states that
// require additional disclosure text. Returns '' for states with no overlay.
function stateOverlayBlock(state) {
  const key = normalizeState(state);
  // Example (counsel to confirm exact wording before enabling):
  //
  //   if (key === 'CA' || key === 'CALIFORNIA') {
  //     return `<p style="margin:0 0 14px;font-size:13px;color:${PALETTE.muted};">
  //       California residents may contact the Department of Financial Protection
  //       and Innovation at 1-866-275-2677 for questions about commercial
  //       financing.
  //     </p>`;
  //   }
  return '';
}

function stateOverlayText(state) {
  // Plain-text mirror of stateOverlayBlock. Keep in sync when counsel adds a
  // state paragraph above.
  return '';
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// FCRA §615(a) block — required only when a consumer report was actually
// pulled. Endpoint decides based on presence of the Experian Report file on
// the Monday item; per-reason templates do not.
function fcraBlockHtml({ includeScore, score, scoreDate, keyFactors }) {
  const scoreLines = includeScore ? `
    <p style="margin:0 0 10px;">
      A credit score used in our decision was <strong>${escapeHtml(score)}</strong>,
      obtained from ${EXPERIAN.name} on ${escapeHtml(scoreDate)}. The FICO score
      range is 300 to 850, with higher scores representing lower credit risk.
      The key factors that adversely affected this score were:
    </p>
    <ul style="margin:0 0 12px 22px;padding:0;">
      ${(keyFactors || []).slice(0, 4).map(f => `<li style="margin:0 0 4px;">${escapeHtml(f)}</li>`).join('')}
    </ul>` : '';

  return `
    <div style="background:${PALETTE.fcraStripe};border-left:3px solid ${PALETTE.fcraBorder};padding:14px 16px;margin:0 0 18px;border-radius:3px;font-size:13px;color:${PALETTE.ink};">
      <p style="margin:0 0 10px;font-weight:600;color:${PALETTE.green};">
        Information about the consumer report we used
      </p>
      <p style="margin:0 0 10px;">
        Our decision was based in whole or in part on information contained in
        a consumer report about the guarantor obtained from:
      </p>
      <p style="margin:0 0 12px;padding-left:14px;border-left:2px solid ${PALETTE.divider};">
        ${EXPERIAN.name}<br>
        ${EXPERIAN.addr1}<br>
        ${EXPERIAN.city}, ${EXPERIAN.state} ${EXPERIAN.zip}<br>
        ${EXPERIAN.phone}<br>
        ${EXPERIAN.web}
      </p>
      <p style="margin:0 0 10px;">
        ${EXPERIAN.name} did not make the credit decision and is unable to
        provide the specific reasons why the application was denied.
      </p>
      <p style="margin:0 0 10px;">
        You have the right to obtain a free copy of your consumer report from
        ${EXPERIAN.name} if you request it within 60 days of receiving this
        notice.
      </p>
      <p style="margin:0 0 ${includeScore ? '10px' : '0'};">
        You also have the right to dispute the accuracy or completeness of any
        information ${EXPERIAN.name} furnished by contacting them directly at
        the address or phone number above.
      </p>
      ${scoreLines}
    </div>
  `;
}

function fcraBlockText({ includeScore, score, scoreDate, keyFactors }) {
  const lines = [
    'ABOUT THE CONSUMER REPORT WE USED',
    '',
    'Our decision was based in whole or in part on information contained in a',
    'consumer report about the guarantor obtained from:',
    '',
    `  ${EXPERIAN.name}`,
    `  ${EXPERIAN.addr1}`,
    `  ${EXPERIAN.city}, ${EXPERIAN.state} ${EXPERIAN.zip}`,
    `  ${EXPERIAN.phone}`,
    `  ${EXPERIAN.web}`,
    '',
    `${EXPERIAN.name} did not make the credit decision and is unable to provide`,
    'the specific reasons why the application was denied.',
    '',
    `You have the right to obtain a free copy of your consumer report from`,
    `${EXPERIAN.name} if you request it within 60 days of receiving this notice.`,
    '',
    'You also have the right to dispute the accuracy or completeness of any',
    `information ${EXPERIAN.name} furnished by contacting them directly at the`,
    'address or phone number above.',
  ];
  if (includeScore) {
    lines.push('');
    lines.push(`A credit score used in our decision was ${score}, obtained from`);
    lines.push(`${EXPERIAN.name} on ${scoreDate}. The FICO score range is 300 to 850,`);
    lines.push('with higher scores representing lower credit risk. The key factors');
    lines.push('that adversely affected this score were:');
    lines.push('');
    for (const f of (keyFactors || []).slice(0, 4)) {
      lines.push(`  • ${f}`);
    }
  }
  return lines.join('\n');
}

// Reg B Appendix C ECOA equal-credit-opportunity notice — mandatory in every
// decline email regardless of whether credit was pulled.
function ecoaEqualCreditNoticeHtml() {
  return `
    <div style="border-top:1px solid ${PALETTE.divider};padding-top:14px;margin:0 0 14px;font-size:12px;color:${PALETTE.muted};line-height:1.6;">
      <p style="margin:0 0 8px;font-weight:600;color:${PALETTE.green};">
        Notice: The Federal Equal Credit Opportunity Act
      </p>
      <p style="margin:0;">
        The Federal Equal Credit Opportunity Act prohibits creditors from
        discriminating against credit applicants on the basis of race, color,
        religion, national origin, sex, marital status, age (provided the
        applicant has the capacity to enter into a binding contract); because
        all or part of the applicant's income derives from any public assistance
        program; or because the applicant has in good faith exercised any right
        under the Consumer Credit Protection Act. The federal agency that
        administers compliance with this law concerning this creditor is the
        Federal Trade Commission, Equal Credit Opportunity, Washington, DC 20580.
      </p>
    </div>
  `;
}

function ecoaEqualCreditNoticeText() {
  return [
    '',
    'NOTICE: THE FEDERAL EQUAL CREDIT OPPORTUNITY ACT',
    '',
    'The Federal Equal Credit Opportunity Act prohibits creditors from',
    'discriminating against credit applicants on the basis of race, color,',
    'religion, national origin, sex, marital status, age (provided the applicant',
    'has the capacity to enter into a binding contract); because all or part of',
    "the applicant's income derives from any public assistance program; or",
    'because the applicant has in good faith exercised any right under the',
    'Consumer Credit Protection Act. The federal agency that administers',
    'compliance with this law concerning this creditor is the Federal Trade',
    'Commission, Equal Credit Opportunity, Washington, DC 20580.',
  ].join('\n');
}

// Compose the full HTML email. Per-reason templates supply the parts that
// vary; everything else comes from this module.
function renderDeclineHtml({
  ownerFirstName,
  businessName,
  headline,          // one-sentence decision statement
  principalReasons,  // array of 1–4 short strings, ECOA-specific reasons
  reapplyInvitation, // string, one paragraph
  includeFcra,       // bool — Experian file attached?
  includeScore,      // bool — Low FICO template?
  fcraCtx,           // { score, scoreDate, keyFactors[] } — required if includeScore
  businessState,     // string
}) {
  const overlay = stateOverlayBlock(businessState);
  const fcra    = includeFcra ? fcraBlockHtml({ includeScore, ...(fcraCtx || {}) }) : '';
  const reasonsHtml = `
    <ul style="margin:0 0 16px 22px;padding:0;">
      ${(principalReasons || []).slice(0, 4).map(r => `<li style="margin:0 0 6px;">${escapeHtml(r)}</li>`).join('')}
    </ul>
  `;
  return `<!doctype html>
<html><body style="font-family:${FONT_STACK};color:${PALETTE.ink};line-height:1.55;max-width:640px;margin:0 auto;padding:24px;">
  <h2 style="font-size:20px;color:${PALETTE.green};margin:0 0 4px;font-weight:500;">Regarding your Guavo application</h2>
  <p style="color:${PALETTE.muted};font-size:13px;margin:0 0 20px;">${escapeHtml(businessName)}</p>

  <p style="margin:0 0 14px;">Hi ${escapeHtml(ownerFirstName || 'there')},</p>
  <p style="margin:0 0 14px;">${escapeHtml(headline)}</p>

  <p style="margin:0 0 8px;font-weight:600;color:${PALETTE.green};">Principal reason${(principalReasons || []).length > 1 ? 's' : ''} for our decision</p>
  ${reasonsHtml}

  <p style="margin:0 0 18px;">${escapeHtml(reapplyInvitation)}</p>

  ${fcra}

  ${overlay}

  <p style="margin:0 0 14px;">If you have questions about this notice or would like to discuss what a future application might look like, please reply directly to this email or call me at <a href="tel:+17144002237" style="color:${PALETTE.green};">(714) 400-2237</a>.</p>

  <p style="margin:0 0 4px;">Warmly,</p>
  <p style="margin:0 0 2px;font-weight:500;">Patti</p>
  <p style="margin:0 0 20px;font-size:13px;color:${PALETTE.muted};">Guavo</p>

  ${ecoaEqualCreditNoticeHtml()}

  <hr style="border:none;border-top:1px solid ${PALETTE.divider};margin:20px 0;">
  <p style="font-size:11px;color:${PALETTE.muted};margin:0;">Guavo Inc. &nbsp;|&nbsp; patti@guavo.com &nbsp;|&nbsp; (714) 400-2237 &nbsp;|&nbsp; Miami, FL</p>
</body></html>`;
}

function renderDeclineText({
  ownerFirstName,
  businessName,
  headline,
  principalReasons,
  reapplyInvitation,
  includeFcra,
  includeScore,
  fcraCtx,
  businessState,
}) {
  const lines = [
    'Regarding your Guavo application',
    businessName,
    '',
    `Hi ${ownerFirstName || 'there'},`,
    '',
    headline,
    '',
    `Principal reason${(principalReasons || []).length > 1 ? 's' : ''} for our decision:`,
  ];
  for (const r of (principalReasons || []).slice(0, 4)) lines.push(`  • ${r}`);
  lines.push('');
  lines.push(reapplyInvitation);
  if (includeFcra) {
    lines.push('');
    lines.push(fcraBlockText({ includeScore, ...(fcraCtx || {}) }));
  }
  const overlay = stateOverlayText(businessState);
  if (overlay) {
    lines.push('');
    lines.push(overlay);
  }
  lines.push('');
  lines.push('If you have questions about this notice or would like to discuss');
  lines.push('what a future application might look like, please reply directly');
  lines.push('to this email or call me at (714) 400-2237.');
  lines.push('');
  lines.push('Warmly,');
  lines.push('Patti');
  lines.push('Guavo');
  lines.push('');
  lines.push(ecoaEqualCreditNoticeText());
  lines.push('');
  lines.push('Guavo Inc. | patti@guavo.com | (714) 400-2237 | Miami, FL');
  return lines.join('\n');
}

module.exports = {
  PALETTE,
  EXPERIAN,
  APPROVED_STATES,
  normalizeState,
  isStateApproved,
  stateOverlayBlock,
  stateOverlayText,
  escapeHtml,
  fcraBlockHtml,
  fcraBlockText,
  ecoaEqualCreditNoticeHtml,
  ecoaEqualCreditNoticeText,
  renderDeclineHtml,
  renderDeclineText,
};
