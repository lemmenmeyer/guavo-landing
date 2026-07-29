// Decline Reason: Manufactured Deposits
//
// The "Manufactured Deposits" label already existed on both Monday decline
// columns but had no template, which meant setting it caused the endpoint to
// bail with `unmapped-reason` and send nothing at all. This closes that gap.
//
// Same wording policy and same shape as fraudulent-documents.js: state only
// that we could not verify revenue meeting the minimum, fold into the standard
// revenue-threshold closing, and do NOT open a re-verification dialogue.
// Never characterise the deposits as manufactured, recycled or circular in
// applicant-facing copy. The label is internal taxonomy.
//
// Pairing note: this reads as a near duplicate of Fraudulent Documents when
// both are set, because externally they collapse to the same statement. Prefer
// ONE reason on the outbound for the K13 archetype. Keep this template for the
// case where deposit quality is the actual and only finding, for example
// verified statements whose deposits are demonstrably circular between the
// owner's own accounts.
//
// The floor is delegated to under-minimum-revenue.js so the number lives in
// exactly one place. Do not restate it here.
//
// No dashes in the applicant-facing strings, per [[feedback-no-dashes-outbound]].

const underMinimumRevenue = require('./under-minimum-revenue');

module.exports = {
  label: 'Manufactured Deposits',

  bullet: () =>
    'The deposit activity in the bank statements provided did not establish business revenue at or above the minimum required for our program.',

  threshold: () => underMinimumRevenue.threshold(),

  // Intentionally NO soloReapply / pairedReapply — matches fraudulent-documents.js.

  requiresScoreDisclosure: false,

  missingFields: (ctx) => underMinimumRevenue.missingFields(ctx),
};
