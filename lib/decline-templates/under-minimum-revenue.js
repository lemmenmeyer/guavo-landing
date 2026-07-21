// Decline Reason: Under Minimum Revenue
//
// FCRA base block fires only if the Experian file was attached (endpoint
// decides). Score disclosure never fires here — this reason isn't score-based.
//
// APPROX_REVENUE_FLOOR: applicant-facing minimum. Confirmed 2026-07-17.
// Differs from credit-box K1 ($20,000/mo → brokerage routing) intentionally.
// K1 is the internal routing threshold; this is what we tell applicants.

const APPROX_REVENUE_FLOOR = '$15,000';

module.exports = {
  label: 'Under Minimum Revenue',
  bullet: () =>
    'Your average monthly revenue, as reflected in the bank statements provided, was below the minimum threshold for our program.',
  threshold: () => APPROX_REVENUE_FLOOR == null ? null : `an average monthly revenue of at least ${APPROX_REVENUE_FLOOR}`,
  requiresScoreDisclosure: false,
  missingFields: () => {
    if (APPROX_REVENUE_FLOOR == null) {
      return ['Under Minimum Revenue threshold not yet set (edit APPROX_REVENUE_FLOOR in lib/decline-templates/under-minimum-revenue.js)'];
    }
    return [];
  },
};
