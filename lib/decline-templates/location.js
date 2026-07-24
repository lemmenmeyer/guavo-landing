// Decline Reason: Location
//
// FCRA base block fires only if the Experian file was attached (endpoint
// decides). Never triggers score disclosure.
//
// Location is a "coverage" reason, not an "improvable" one: the applicant
// can't change their state to clear a bar — only Guavo expanding its
// footprint resolves it. So it never folds into the composer's
// "We generally look for X" threshold clause (that would read as if we're
// asking them to relocate). Instead:
//   - `soloReapply` gives a warm standalone line when Location is the ONLY reason.
//   - `pairedReapply` gives a lowercase fragment the composer appends after the
//     "We generally look for X" clause when Location is paired with another reason.
// `threshold` is retained for reference but is intentionally not consumed while
// `pairedReapply` is defined.

module.exports = {
  label: 'Location',
  bullet: () =>
    'Your business is located outside the states we currently serve.',
  threshold: () => 'operations in a state we currently serve',
  soloReapply: () =>
    'We hope to be able to offer financing in your state soon.',
  pairedReapply: () =>
    'we hope to offer financing in your state soon',
  requiresScoreDisclosure: false,
  missingFields: () => [],
};
