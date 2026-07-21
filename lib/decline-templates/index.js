// Dispatch table mapping Monday Decline Reason label text → template config.
// Both Decline Reason (color_mm5af0yz) and Decline Reason 2 (color_mm5b1w2v)
// look up templates through this table. Keys are the exact label text on the
// Monday columns (case-sensitive).
//
// Each template exports a config-style module: label, bullet(), threshold(),
// requiresScoreDisclosure, missingFields(ctx). See common.js composer.

module.exports = {
  'Low FICO':              require('./low-fico'),
  'Low ADB':               require('./low-adb'),
  'Under Minimum Revenue': require('./under-minimum-revenue'),
  'Location':              require('./location'),
};
