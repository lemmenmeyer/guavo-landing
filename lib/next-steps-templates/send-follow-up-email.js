// Next Steps label: "Send follow-up email"
//
// Generic warm check-in when a file has gone quiet. Kept intentionally short —
// this template is meant to open a reply, not to close a decision. If the
// specific ask is known (a missing document, a signature, etc.) use "Request
// info from applicant" instead when that template is added.

const shell = require('../email-shell');

function build(ctx) {
  // ctx = { ownerFirstName, businessName, amountRequested, refId }
  const heading = 'Checking in on your Guavo application';
  const subheading = ctx.businessName || '';

  const amount = ctx.amountRequested || 'your financing request';
  const business = ctx.businessName || 'your business';

  const bodyHtml = `
    <p style="margin:0 0 14px;">Hi ${shell.escapeHtml(ctx.ownerFirstName || 'there')},</p>
    <p style="margin:0 0 14px;">Just checking in on the ${shell.escapeHtml(amount)} request for <strong>${shell.escapeHtml(business)}</strong>. We wanted to make sure nothing was blocking you on our side.</p>
    <p style="margin:0 0 18px;">If you have any questions, or if there is anything we can help clarify about the process or timing, just reply to this email or call <a href="tel:+17144002237" style="color:${shell.PALETTE.green};">(714) 400-2237</a>.</p>
  `;

  const bodyLines = [
    `Hi ${ctx.ownerFirstName || 'there'},`,
    '',
    `Just checking in on the ${amount} request for ${business}. We wanted to make sure nothing was blocking you on our side.`,
    '',
    'If you have any questions, or if there is anything we can help clarify about the process or timing, just reply to this email or call (714) 400-2237.',
  ];

  return {
    subject: ctx.refId ? `Checking in on your Guavo application (Ref ${ctx.refId})` : 'Checking in on your Guavo application',
    html:    shell.emailShell({ heading, subheading, bodyHtml }),
    text:    shell.textShell({ heading, bodyLines }),
  };
}

function missingFields(_ctx) {
  return [];
}

module.exports = { build, missingFields };
