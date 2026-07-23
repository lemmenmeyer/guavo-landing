// Shared building blocks for Guavo decline-notice templates.
//
// Every per-reason template exports composable pieces (bullet, threshold,
// requiresScoreDisclosure, missingFields) and the composer in this file
// assembles 1 or 2 reasons into the final email.
//
// Compliance surface after 2026-07-17:
//   * ECOA / Reg B block removed per [[feedback-guavo-ecoa-dropped]].
//   * FCRA §615(a) block still fires whenever a consumer report was used
//     (Experian Report file attached on the Monday item). Score-disclosure
//     sub-block fires only when a reason with requiresScoreDisclosure=true
//     is present (i.e., Low FICO).
//   * State overlay hook is preserved. APPROVED_STATES starts empty and is
//     the fail-closed gate in the endpoint.

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

// Score model actually pulled on Guavo deals. The disclosure must name the
// model the decision used — do not label it FICO unless the pull is FICO.
const SCORE_MODEL = 'VantageScore 4';
const SCORE_RANGE = '300 to 850';

// Counsel-managed allowlist. Empty by default — makes the endpoint fail
// closed on every state until counsel explicitly clears each one.
const APPROVED_STATES = new Set([
  // 'FL', 'TX', 'GA',
]);

function normalizeState(s) {
  return String(s || '').trim().toUpperCase();
}

function isStateApproved(s) {
  return APPROVED_STATES.has(normalizeState(s));
}

// Per-state overlay paragraphs. Returns '' for states with no overlay.
function stateOverlayBlock(_state) {
  return '';
}

function stateOverlayText(_state) {
  return '';
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Normalize a business name from the app form to title case. Preserves
// standard entity suffixes in uppercase (LLC, INC, LP, etc.), keeps small
// connective words lowercase in the middle of the name, first word always
// capitalized. Handles the common form-entry cases:
//   "heavenly cleaning company" → "Heavenly Cleaning Company"
//   "apex products llc"         → "Apex Products LLC"
//   "the ABC co"                → "The ABC Co"
// Applied inside composeDeclineEmail so both endpoint and drafting flow
// normalize uniformly.
const PRESERVE_UPPER = new Set([
  'LLC', 'INC', 'LP', 'LLP', 'PLLC', 'LTD', 'PC', 'CO', 'CORP',
  'DBA', 'AKA', 'PA', 'USA', 'US',
]);
const KEEP_LOWERCASE = new Set([
  'and', 'of', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for',
  'or', 'but', 'by',
]);
function titleCaseBusinessName(raw) {
  if (!raw) return raw;
  const parts = String(raw).trim().split(/(\s+)/);
  return parts.map((part, i) => {
    if (/^\s+$/.test(part)) return part;
    const stripped = part.replace(/[^A-Za-z0-9&]/g, '');
    if (!stripped) return part;
    if (PRESERVE_UPPER.has(stripped.toUpperCase())) return part.toUpperCase();
    const lower = part.toLowerCase();
    const isFirstWord = i === 0;
    if (!isFirstWord && KEEP_LOWERCASE.has(lower)) return lower;
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  }).join('');
}

// FCRA §615(a) block — trimmed to the statutory minimum: five base elements
// (report used, CRA identity, CRA didn't decide, 60-day free-copy right,
// dispute right), plus five score elements when a score was used
// (value, date, range, source, up to 4 key factors).
function fcraBlockHtml({ includeScore, score, scoreDate, keyFactors }) {
  const factors = (keyFactors || []).slice(0, 4).map(escapeHtml).join('; ');
  const scoreLine = includeScore ? `
      <p style="margin:10px 0 0;">The credit score used was <strong>${escapeHtml(score)}</strong> (${SCORE_MODEL} from ${EXPERIAN.name}, ${escapeHtml(scoreDate)}). Scores in this model range from ${SCORE_RANGE}. Key factors that adversely affected your score: ${factors}.</p>` : '';

  return `
    <div style="background:${PALETTE.fcraStripe};border-left:3px solid ${PALETTE.fcraBorder};padding:14px 16px;margin:0 0 18px;border-radius:3px;font-size:13px;color:${PALETTE.ink};">
      <p style="margin:0;">Our decision was based in part on your consumer report from ${EXPERIAN.name} (${EXPERIAN.addr1}, ${EXPERIAN.city}, ${EXPERIAN.state} ${EXPERIAN.zip}; ${EXPERIAN.phone}; ${EXPERIAN.web}). ${EXPERIAN.name} did not make this decision and is unable to provide you the specific reasons why we declined your application. You have the right to a free copy of your report from ${EXPERIAN.name} within 60 days and to dispute any inaccurate information it contains.</p>${scoreLine}
    </div>
  `;
}

function fcraBlockText({ includeScore, score, scoreDate, keyFactors }) {
  const base = `Our decision was based in part on your consumer report from ${EXPERIAN.name} (${EXPERIAN.addr1}, ${EXPERIAN.city}, ${EXPERIAN.state} ${EXPERIAN.zip}; ${EXPERIAN.phone}; ${EXPERIAN.web}). ${EXPERIAN.name} did not make this decision and is unable to provide you the specific reasons why we declined your application. You have the right to a free copy of your report from ${EXPERIAN.name} within 60 days and to dispute any inaccurate information it contains.`;
  if (!includeScore) return base;
  const factors = (keyFactors || []).slice(0, 4).join('; ');
  return `${base}\n\nThe credit score used was ${score} (${SCORE_MODEL} from ${EXPERIAN.name}, ${scoreDate}). Scores in this model range from ${SCORE_RANGE}. Key factors that adversely affected your score: ${factors}.`;
}

// Join threshold clauses naturally with "and". Handles 1, 2, or more.
function joinThresholds(list) {
  const arr = list.filter(Boolean);
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(', ')}, and ${arr[arr.length - 1]}`;
}

// Compose the full email from 1 or 2 reasons. Each reason is a per-reason
// template config: { bullet(), threshold(), requiresScoreDisclosure, ... }.
function composeDeclineEmail({
  ownerFirstName,
  businessName,
  businessState,
  reasons,           // array of {label, bullet, threshold, requiresScoreDisclosure}
  experianReportAttached,
  fcraCtx,           // { score, scoreDate, keyFactors[] } — used only if a reason requiresScoreDisclosure
}) {
  businessName = titleCaseBusinessName(businessName);
  const includeScore = reasons.some(r => r.requiresScoreDisclosure);
  const isPlural     = reasons.length > 1;
  const heading      = `Principal reason${isPlural ? 's' : ''} for our decision`;

  const bullets = reasons.map(r => r.bullet());
  const thresholds = reasons.map(r => r.threshold()).filter(Boolean);
  const thresholdClause = joinThresholds(thresholds);

  // Solo override: when there's exactly one reason and it defines soloReapply,
  // use that warmer standalone line instead of the composed "We generally look
  // for..." pattern. Paired cases always use the composed pattern for
  // consistency across mixed reasons.
  let reapplyInvitation;
  if (reasons.length === 1 && typeof reasons[0].soloReapply === 'function') {
    reapplyInvitation = reasons[0].soloReapply();
  } else if (thresholdClause) {
    reapplyInvitation = `If the factors above improve materially over time, please reapply. We generally look for ${thresholdClause}.`;
  } else {
    reapplyInvitation = `If the factors above change over time, please reapply.`;
  }

  const fcraHtml = experianReportAttached
    ? fcraBlockHtml({ includeScore, ...(fcraCtx || {}) })
    : '';
  const overlayHtml = stateOverlayBlock(businessState);

  const bulletsHtml = `
    <ul style="margin:0 0 16px 22px;padding:0;">
      ${bullets.map(b => `<li style="margin:0 0 6px;">${escapeHtml(b)}</li>`).join('')}
    </ul>
  `;

  const html = `<!doctype html>
<html><body style="font-family:${FONT_STACK};color:${PALETTE.ink};line-height:1.55;max-width:640px;margin:0 auto;padding:24px;">
  <h2 style="font-size:20px;color:${PALETTE.green};margin:0 0 4px;font-weight:500;">Regarding your Guavo application</h2>
  <p style="color:${PALETTE.muted};font-size:13px;margin:0 0 20px;">${escapeHtml(businessName)}</p>

  <p style="margin:0 0 14px;">Hi ${escapeHtml(ownerFirstName || 'there')},</p>
  <p style="margin:0 0 14px;">Guavo is unable to approve your application at this time.</p>

  <p style="margin:0 0 8px;font-weight:600;color:${PALETTE.green};">${heading}</p>
  ${bulletsHtml}

  <p style="margin:0 0 18px;">${escapeHtml(reapplyInvitation)}</p>

  ${fcraHtml}

  ${overlayHtml}

  <p style="margin:0 0 4px;">Best,</p>
  <p style="margin:0 0 2px;font-weight:500;">Daniel</p>
  <p style="margin:0 0 20px;font-size:13px;color:${PALETTE.muted};">Guavo</p>

  <hr style="border:none;border-top:1px solid ${PALETTE.divider};margin:20px 0;">
  <p style="font-size:11px;color:${PALETTE.muted};margin:0;">Guavo Inc. &nbsp;|&nbsp; daniel@guavo.com &nbsp;|&nbsp; Miami, FL</p>
</body></html>`;

  const lines = [
    'Regarding your Guavo application',
    businessName,
    '',
    `Hi ${ownerFirstName || 'there'},`,
    '',
    'Guavo is unable to approve your application at this time.',
    '',
    `${heading}:`,
  ];
  for (const b of bullets) lines.push(`  • ${b}`);
  lines.push('');
  lines.push(reapplyInvitation);
  if (experianReportAttached) {
    lines.push('');
    lines.push(fcraBlockText({ includeScore, ...(fcraCtx || {}) }));
  }
  const overlayTxt = stateOverlayText(businessState);
  if (overlayTxt) {
    lines.push('');
    lines.push(overlayTxt);
  }
  lines.push('');
  lines.push('Best,');
  lines.push('Daniel');
  lines.push('Guavo');
  lines.push('');
  lines.push('Guavo Inc. | daniel@guavo.com | Miami, FL');

  return {
    subject: 'Regarding your Guavo application',
    html,
    text: lines.join('\n'),
  };
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
  joinThresholds,
  titleCaseBusinessName,
  composeDeclineEmail,
};
