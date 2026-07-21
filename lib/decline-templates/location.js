// Decline Reason: Location
//
// FCRA base block fires only if the Experian file was attached (endpoint
// decides). Never triggers score disclosure.
//
// `soloReapply` overrides the composer's "We generally look for X and Y"
// reapply invitation when Location is the ONLY decline reason — the
// state-footprint case reads more naturally with a warm standalone line.
// When Location is paired with another reason, the composed pattern applies
// (using threshold() as the paired-form phrase).

module.exports = {
  label: 'Location',
  bullet: () =>
    'Your business is located outside the states we currently serve.',
  threshold: () => 'operations in a state we currently serve',
  soloReapply: () =>
    'We hope to be able to offer financing in your state soon.',
  requiresScoreDisclosure: false,
  missingFields: () => [],
};
