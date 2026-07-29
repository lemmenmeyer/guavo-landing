// Decline Reason: Fraudulent Documents
//
// Fires from credit-box K13 (fabricated or altered financial documents).
//
// WORDING POLICY — read before editing.
//
// The internal finding and the applicant-facing sentence are deliberately NOT
// the same statement. Internally, K13 is a determination that the documents
// were altered, and the underwriting memo says so in detail. Externally, we
// say only that we could not verify revenue meeting our minimum.
//
// Three reasons to keep it narrow:
//   1. It is what we can actually prove to a third party. Our evidence is that
//      the documents cannot be relied on, so the revenue is unverified. That
//      claim is true, specific, and survives being repeated back to us.
//   2. An accusation of fraud in writing, to someone we have not heard from,
//      carries defamation exposure that "unable to verify" does not.
//   3. If we are wrong (a mangled export, a genuine bank quirk we have not
//      seen before), "unable to verify" costs an applicant one clarifying
//      reply. An accusation costs them a relationship and costs us more.
//
// So: never use "fraudulent", "falsified", "altered", "manufactured" or
// "misrepresented" in applicant-facing copy for this reason. The label on the
// Monday column is internal taxonomy, not a script.
//
// SHAPE (boss direction 2026-07-28): this reads as a revenue-threshold decline,
// NOT as an invitation to re-verify. An earlier draft closed with "reply to
// this email and we can walk through how to verify your revenue directly",
// which opened a dialogue we do not want on this archetype. That line is gone.
// By defining threshold() and NOT defining soloReapply/pairedReapply, this
// template folds into the composer's standard closing:
//
//     "If the factors above improve materially over time, please reapply.
//      We generally look for an average monthly revenue of at least $15,000."
//
// Note the bullet says we could not verify revenue AT OR ABOVE THE MINIMUM.
// That is deliberate and it is true: we did not establish qualifying revenue.
// It does not assert their revenue is low, and it does not assert fraud.
//
// The floor is delegated to under-minimum-revenue.js so the number lives in
// exactly one place. Do not restate it here.
//
// No dashes in the applicant-facing strings, per [[feedback-no-dashes-outbound]].

const underMinimumRevenue = require('./under-minimum-revenue');

module.exports = {
  label: 'Fraudulent Documents',

  bullet: () =>
    'We were unable to verify business revenue at or above the minimum required for our program from the documentation provided.',

  // Single source of truth for the floor. Folds into the composer's
  // "We generally look for ..." clause.
  threshold: () => underMinimumRevenue.threshold(),

  // Intentionally NO soloReapply / pairedReapply. See SHAPE note above.

  requiresScoreDisclosure: false,

  missingFields: (ctx) => underMinimumRevenue.missingFields(ctx),
};
