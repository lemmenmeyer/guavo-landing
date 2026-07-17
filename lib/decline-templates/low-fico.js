// Decline Reason: Low FICO
//
// FCRA §615(a) score disclosure is REQUIRED for this template — validation in
// api/send-decline.js ensures the Experian Report file, FICO number, pull date,
// and key factors are all populated before firing.

const common = require('./common');

// Guavo's current program floor. Update here when underwriting policy changes;
// the value is embedded in the applicant-facing reapply guidance so keep the
// two in sync.
const APPROX_FICO_FLOOR = 600;

function build(ctx) {
  // ctx = {
  //   ownerFirstName, businessName, businessState,
  //   fico, ficoPullDate, ficoKeyFactors[]
  // }
  const headline = "After reviewing your file, we are unable to approve your application for financing at this time.";
  const factorText = (ctx.ficoKeyFactors && ctx.ficoKeyFactors.length > 0)
    ? ctx.ficoKeyFactors.slice(0, 4).join('; ')
    : 'the factors listed in the credit-report information below';
  const principalReasons = [
    `The personal credit report we obtained on the guarantor showed a score below the minimum we can approve for this program. Key factors per Experian: ${factorText}.`,
  ];
  const reapplyInvitation =
    `If the factors above improve materially over time, please reapply. We generally look for a personal FICO of ${APPROX_FICO_FLOOR} or better, though the specific threshold varies by other strengths in the file. Reapplication does not guarantee approval and will require a full re-underwriting.`;

  return {
    subject: 'Regarding your Guavo application',
    html: common.renderDeclineHtml({
      ownerFirstName: ctx.ownerFirstName,
      businessName:   ctx.businessName,
      headline,
      principalReasons,
      reapplyInvitation,
      includeFcra:  true,
      includeScore: true,
      fcraCtx: {
        score:      ctx.fico,
        scoreDate:  ctx.ficoPullDate,
        keyFactors: ctx.ficoKeyFactors || [],
      },
      businessState: ctx.businessState,
    }),
    text: common.renderDeclineText({
      ownerFirstName: ctx.ownerFirstName,
      businessName:   ctx.businessName,
      headline,
      principalReasons,
      reapplyInvitation,
      includeFcra:  true,
      includeScore: true,
      fcraCtx: {
        score:      ctx.fico,
        scoreDate:  ctx.ficoPullDate,
        keyFactors: ctx.ficoKeyFactors || [],
      },
      businessState: ctx.businessState,
    }),
  };
}

// Extra required-fields check surfaced up to the endpoint so we can post a
// specific "please fill X before reclicking" message.
function missingFields(ctx) {
  const missing = [];
  if (!ctx.experianReportAttached) missing.push('Experian Report file');
  if (!ctx.fico)                   missing.push('FICO number');
  if (!ctx.ficoPullDate)           missing.push('FICO Pull Date');
  if (!ctx.ficoKeyFactors || ctx.ficoKeyFactors.length === 0) {
    missing.push('FICO Key Factors');
  }
  return missing;
}

module.exports = { build, missingFields };
