// Dispatch table mapping Monday Decline Reason label text → template config.
// Both Decline Reason (color_mm5af0yz) and Decline Reason 2 (color_mm5b1w2v)
// look up templates through this table. Keys are the exact label text on the
// Monday columns (case-sensitive).
//
// Each template exports a config-style module: label, bullet(), threshold(),
// requiresScoreDisclosure, missingFields(ctx). See common.js composer.

// Labels present on the Monday columns but intentionally NOT mapped here will
// cause the endpoint to post a note and send nothing. That is the safe failure
// mode, but it is silent from the applicant's side, so keep this table in sync
// with the label pool. Unmapped as of 2026-07-28: Restricted industry,
// High Revenue Concentration, Locked Credit Score, Nonprofit, Sole Proprietor.

module.exports = {
  'Low FICO':              require('./low-fico'),
  'Low ADB':               require('./low-adb'),
  'Under Minimum Revenue': require('./under-minimum-revenue'),
  'Location':              require('./location'),
  // K13 / deposit-quality declines. Both state only that revenue could not be
  // verified; see the wording policy at the top of fraudulent-documents.js
  // before editing either. Prefer ONE of these on the outbound, not both.
  'Fraudulent Documents':  require('./fraudulent-documents'),
  'Manufactured Deposits': require('./manufactured-deposits'),
};
