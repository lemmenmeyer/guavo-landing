// Decline Reason: Sole Proprietor
//
// Eligibility decline, not a performance or credit decline. Guavo funds
// registered business entities (LLC, corporation, LP, PLLC, etc.). An
// applicant operating as a sole proprietorship has no separate legal entity,
// which is outside the product. This is the clean, non-accusatory ground we
// use even when other internal kills are present (e.g. a K13 document-
// authenticity kill) — the applicant-facing reason stays the entity policy.
//
// Never triggers score disclosure. The FCRA base block still fires only if an
// Experian file happened to be attached (endpoint decides); this reason does
// not itself rely on a consumer report.
//
// `soloReapply` gives a warm, actionable standalone line when Sole Proprietor
// is the ONLY decline reason: the applicant can come back after registering an
// entity. When paired with another reason, the composed "We generally look
// for ..." pattern uses threshold() instead.

module.exports = {
  label: 'Sole Proprietor',
  bullet: () =>
    'Guavo provides financing to registered business entities. Your application was submitted under a sole proprietorship, which does not have a separate legal entity, so it falls outside the businesses we are able to fund.',
  threshold: () =>
    'a business registered as a legal entity, such as an LLC or corporation',
  soloReapply: () =>
    'If you register your business as an LLC or corporation, we would be glad to review a new application.',
  requiresScoreDisclosure: false,
  missingFields: () => [],
};
