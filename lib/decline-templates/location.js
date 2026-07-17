// Decline Reason: Location
//
// FCRA block conditionally included: only if the Experian Report file was
// attached on the Monday item (i.e., credit was pulled before deciding). If
// no report was pulled, ECOA-only email.

const common = require('./common');

function build(ctx) {
  // ctx = {
  //   ownerFirstName, businessName, businessState,
  //   experianReportAttached (bool)
  // }
  const headline = "After reviewing your file, we are unable to approve your application for financing at this time.";
  const principalReasons = [
    'Your business is located outside the states we currently serve.',
  ];
  const reapplyInvitation =
    'Our footprint expands periodically. If you open or relocate operations to a state in our footprint, or if you check back in a few months, we would be glad to reconsider. Reapplication does not guarantee approval and will require a full re-underwriting.';

  const shared = {
    ownerFirstName: ctx.ownerFirstName,
    businessName:   ctx.businessName,
    headline,
    principalReasons,
    reapplyInvitation,
    includeFcra:  !!ctx.experianReportAttached,
    includeScore: false,
    businessState: ctx.businessState,
  };

  return {
    subject: 'Regarding your Guavo application',
    html:    common.renderDeclineHtml(shared),
    text:    common.renderDeclineText(shared),
  };
}

function missingFields(_ctx) {
  return [];
}

module.exports = { build, missingFields };
