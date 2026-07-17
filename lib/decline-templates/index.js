// Dispatch table mapping Monday Decline Reason label text → template module.
// Kept in one place so the send-decline endpoint doesn't need to import each
// template file, and so adding a new decline label is a one-line edit here
// plus a new file in this directory.
//
// Keys must match the exact label text on Monday column color_mm5af0yz. The
// label text is used (not the numeric index) so template selection remains
// stable if Monday's internal indexes shift.

module.exports = {
  'Low FICO':               require('./low-fico'),
  'Under Minimum Revenue':  require('./under-minimum-revenue'),
  'Location':               require('./location'),

  // When a new Decline Reason label is added on Monday, drop a new file in
  // this directory and add its entry here. If a label represents a
  // non-adverse-action close (e.g. "Timing", "Ghosted after interest") do NOT
  // add it — the endpoint's default branch treats unmapped labels as
  // "no email — silent close" and posts an explanatory Update instead.
};
