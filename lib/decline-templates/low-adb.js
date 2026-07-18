// Decline Reason: Low ADB (Average Daily Balance)
//
// Internal Monday label is "Low ADB" (matches credit-box terminology F1);
// applicant-facing wording pivots to "weekly cash reserve" per boss preference
// (more operationally meaningful to a small-business owner than the banking
// metric ADB). Same underlying signal, friendlier framing.
//
// Bank-statement-driven decline. FCRA base block fires only if the Experian
// file was attached. Never triggers score disclosure.
//
// APPROX_RESERVE_FLOOR: applicant-facing minimum. Confirmed 2026-07-17.

const APPROX_RESERVE_FLOOR = '$1,500';

module.exports = {
  label: 'Low ADB',
  bullet: () =>
    'Your average weekly cash reserve was below the minimum we can approve for this program.',
  threshold: () => APPROX_RESERVE_FLOOR == null ? null : `an average weekly cash reserve of at least ${APPROX_RESERVE_FLOOR}`,
  requiresScoreDisclosure: false,
  missingFields: () => {
    if (APPROX_RESERVE_FLOOR == null) {
      return ['Low ADB reserve threshold not yet set (edit APPROX_RESERVE_FLOOR in lib/decline-templates/low-adb.js)'];
    }
    return [];
  },
};
