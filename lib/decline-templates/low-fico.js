// Decline Reason: Low FICO
//
// Only reason that unconditionally requires the Experian file + FCRA score
// disclosure. Missing-fields check surfaces the specific fields the endpoint
// needs to fire this template.
//
// APPROX_FICO_FLOOR: applicant-facing minimum. Confirmed 2026-07-17.

const APPROX_FICO_FLOOR = 600;

module.exports = {
  label: 'Low FICO',
  bullet: () =>
    'The personal credit report we obtained on the guarantor showed a score below the minimum we can approve for this program.',
  threshold: () => APPROX_FICO_FLOOR == null ? null : `a personal FICO of at least ${APPROX_FICO_FLOOR}`,
  requiresScoreDisclosure: true,
  missingFields: (ctx) => {
    const missing = [];
    if (APPROX_FICO_FLOOR == null) {
      missing.push('Low FICO threshold not yet set (edit APPROX_FICO_FLOOR in lib/decline-templates/low-fico.js)');
    }
    if (!ctx.experianReportAttached) missing.push('Experian Report file');
    if (!ctx.fico)                   missing.push('FICO number');
    if (!ctx.ficoPullDate)           missing.push('FICO Pull Date');
    if (!ctx.ficoKeyFactors || ctx.ficoKeyFactors.length === 0) {
      missing.push('FICO Key Factors');
    }
    return missing;
  },
};
