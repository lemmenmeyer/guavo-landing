// Decline Reason: Under Minimum Revenue
//
// FCRA block conditionally included: only if the Experian Report file was
// attached on the Monday item (i.e., credit was pulled before deciding). If
// no report was pulled, ECOA-only email.

const common = require('./common');

const APPROX_REVENUE_FLOOR = '$15,000';

function build(ctx) {
  // ctx = {
  //   ownerFirstName, businessName, businessState,
  //   experianReportAttached (bool)
  // }
  const headline = "After reviewing your file, we are unable to approve your application for financing at this time.";
  const principalReasons = [
    'Your average monthly deposits, as reflected in the bank statements provided, were below the minimum threshold for our program.',
  ];
  const reapplyInvitation =
    `Our current minimum is roughly ${APPROX_REVENUE_FLOOR} in average monthly deposits, measured over a sustained three-month period. If your revenue rises above that level over the next several months, please reapply. Reapplication does not guarantee approval and will require a full re-underwriting.`;

  const shared = {
    ownerFirstName: ctx.ownerFirstName,
    businessName:   ctx.businessName,
    headline,
    principalReasons,
    reapplyInvitation,
    includeFcra:  !!ctx.experianReportAttached,
    includeScore: false, // never disclose score here — this reason isn't score-based
    businessState: ctx.businessState,
  };

  return {
    subject: 'Regarding your Guavo application',
    html:    common.renderDeclineHtml(shared),
    text:    common.renderDeclineText(shared),
  };
}

function missingFields(_ctx) {
  return []; // no reason-specific requirements beyond the always-required fields
}

module.exports = { build, missingFields };
