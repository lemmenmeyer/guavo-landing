// Next Steps label: "Unlock Experian"
//
// Applicant already gave credit-pull authorization on the app form, but their
// Experian file is frozen/locked so we cannot pull. This asks them to
// temporarily thaw the freeze at Experian directly. No compliance-heavy
// disclosures — this is a procedural request.

const shell = require('../email-shell');

function build(ctx) {
  // ctx = { ownerFirstName, businessName, refId }
  const heading = 'Quick step to unlock your credit report';
  const subheading = ctx.businessName || '';

  const bodyHtml = `
    <p style="margin:0 0 14px;">Hi ${shell.escapeHtml(ctx.ownerFirstName || 'there')},</p>
    <p style="margin:0 0 14px;">Our underwriting team went to pull your Experian credit report and it is currently locked or frozen. That is a security setting you added to your Experian file at some point.</p>
    <p style="margin:0 0 14px;">To keep your Guavo application moving, we would need you to temporarily unfreeze your Experian report. You can do that at <a href="https://www.experian.com/freeze" style="color:${shell.PALETTE.green};">experian.com/freeze</a> or by calling Experian at 1-888-397-3742. It only takes a few minutes.</p>
    <p style="margin:0 0 14px;">The pull we perform is a soft inquiry and will not affect your credit score.</p>
    <p style="margin:0 0 18px;">Once you have thawed the freeze, reply to this email so we know we can try again. You can refreeze right after we complete the pull.</p>
    <p style="margin:0 0 18px;">Any questions, just reply or call <a href="tel:+17144002237" style="color:${shell.PALETTE.green};">(714) 400-2237</a>.</p>
  `;

  const bodyLines = [
    `Hi ${ctx.ownerFirstName || 'there'},`,
    '',
    'Our underwriting team went to pull your Experian credit report and it is currently locked or frozen. That is a security setting you added to your Experian file at some point.',
    '',
    'To keep your Guavo application moving, we would need you to temporarily unfreeze your Experian report. You can do that at experian.com/freeze or by calling Experian at 1-888-397-3742. It only takes a few minutes.',
    '',
    'The pull we perform is a soft inquiry and will not affect your credit score.',
    '',
    'Once you have thawed the freeze, reply to this email so we know we can try again. You can refreeze right after we complete the pull.',
    '',
    'Any questions, just reply or call (714) 400-2237.',
  ];

  return {
    subject: 'Quick step to unlock your credit report (Guavo application)',
    html:    shell.emailShell({ heading, subheading, bodyHtml }),
    text:    shell.textShell({ heading, bodyLines }),
  };
}

function missingFields(_ctx) {
  return []; // no template-specific requirements
}

module.exports = { build, missingFields };
