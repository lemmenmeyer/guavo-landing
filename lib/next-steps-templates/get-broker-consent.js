// Next Steps label: "Get broker consent"
//
// Ask the applicant for their ID and their written consent to share their
// application with Guavo's broker/funding partners. Conditionally asks for
// bank statements if none are attached to the item. Compliance-sensitive —
// contains an informed-consent block (what/who/purpose/revocation) so the
// applicant's reply-back consent is legally usable.
//
// Framing deliberately avoids "we cannot fund you" language to stay clear of
// the Reg B adverse-action-notice trigger. This is a redirection, not a
// denial. If we later formally decline, the send-decline flow handles that.

const shell = require('../email-shell');

function build(ctx) {
  // ctx = {
  //   ownerFirstName, ownerFullName, businessName, refId,
  //   amountRequested (display string like "$25,000"),
  //   hasBankStatements (bool — has statement attachments on the item)
  // }
  const heading = ctx.hasBankStatements
    ? 'Two quick items for your Guavo application'
    : 'Three quick items for your Guavo application';
  const subheading = ctx.refId ? `Ref ${ctx.refId}` : (ctx.businessName || '');

  const amount = ctx.amountRequested || 'your requested amount';
  const business = ctx.businessName || 'your business';

  const openingLine = ctx.hasBankStatements
    ? `We reviewed your ${shell.escapeHtml(amount)} request and bank statements for <strong>${shell.escapeHtml(business)}</strong>. Based on your file, we believe one of our broker and funding partners is a better fit than our direct product.`
    : `We reviewed your ${shell.escapeHtml(amount)} request for <strong>${shell.escapeHtml(business)}</strong>. Based on your file, we believe one of our broker and funding partners is a better fit than our direct product.`;

  const bulletsHtml = ctx.hasBankStatements ? `
    <ol style="margin:0 0 16px 22px;padding:0;">
      <li style="margin:0 0 8px;">A government ID (driver's license, state ID, or passport).</li>
      <li style="margin:0 0 8px;">Your written consent to share your file with our partners. Reply to this email with the line below.</li>
    </ol>
  ` : `
    <ol style="margin:0 0 16px 22px;padding:0;">
      <li style="margin:0 0 8px;">A government ID (driver's license, state ID, or passport).</li>
      <li style="margin:0 0 8px;">Your four most recent business bank statements (PDFs from your online banking, one per month).</li>
      <li style="margin:0 0 8px;">Your written consent to share your file with our partners. Reply to this email with the line below.</li>
    </ol>
  `;

  const twoOrThree = ctx.hasBankStatements ? 'Two' : 'Three';

  const bodyHtml = `
    <p style="margin:0 0 14px;">Hi ${shell.escapeHtml(ctx.ownerFirstName || 'there')},</p>
    <p style="margin:0 0 14px;">${openingLine}</p>
    <p style="margin:0 0 8px;font-weight:600;color:${shell.PALETTE.green};">${twoOrThree} things from you and we can move today:</p>
    ${bulletsHtml}
    <div style="background:${shell.PALETTE.callout};border-left:3px solid ${shell.PALETTE.green};padding:14px 16px;margin:0 0 18px;border-radius:0 3px 3px 0;font-size:13.5px;">
      <p style="margin:0 0 8px;"><strong>What we would share:</strong> your business and personal identifying information, financing request, bank statements, and credit-report information obtained under your prior authorization.</p>
      <p style="margin:0 0 8px;"><strong>With whom:</strong> vetted broker and funding partners in Guavo's network.</p>
      <p style="margin:0 0 8px;"><strong>Purpose:</strong> solely to explore a financing offer for you. Recipients cannot use your information for their own marketing.</p>
      <p style="margin:0;"><strong>Revocation:</strong> you can withdraw this consent any time by replying to this email. Revocation does not pull back information already shared.</p>
    </div>
    <p style="margin:0 0 8px;">Consent line to reply with:</p>
    <blockquote style="margin:0 0 18px;padding:12px 16px;border-left:3px solid ${shell.PALETTE.divider};font-style:italic;color:${shell.PALETTE.ink};">
      I, ${shell.escapeHtml(ctx.ownerFullName || ctx.ownerFirstName || '[your full name]')}, consent to Guavo Inc. sharing the application information described above with its broker and funding partners for the purpose of exploring alternative financing on my behalf.
    </blockquote>
    <p style="margin:0 0 18px;">Any questions, just reply or call <a href="tel:+17144002237" style="color:${shell.PALETTE.green};">(714) 400-2237</a>.</p>
  `;

  const bulletsText = ctx.hasBankStatements
    ? [
        "1. A government ID (driver's license, state ID, or passport).",
        '2. Your written consent to share your file with our partners. Reply to this email with the line below.',
      ]
    : [
        "1. A government ID (driver's license, state ID, or passport).",
        '2. Your four most recent business bank statements (PDFs from your online banking, one per month).',
        '3. Your written consent to share your file with our partners. Reply to this email with the line below.',
      ];

  const bodyLines = [
    `Hi ${ctx.ownerFirstName || 'there'},`,
    '',
    ctx.hasBankStatements
      ? `We reviewed your ${amount} request and bank statements for ${business}. Based on your file, we believe one of our broker and funding partners is a better fit than our direct product.`
      : `We reviewed your ${amount} request for ${business}. Based on your file, we believe one of our broker and funding partners is a better fit than our direct product.`,
    '',
    `${twoOrThree} things from you and we can move today:`,
    '',
    ...bulletsText,
    '',
    'What we would share: your business and personal identifying information, financing request, bank statements, and credit-report information obtained under your prior authorization.',
    "With whom: vetted broker and funding partners in Guavo's network.",
    'Purpose: solely to explore a financing offer for you. Recipients cannot use your information for their own marketing.',
    'Revocation: you can withdraw this consent any time by replying to this email. Revocation does not pull back information already shared.',
    '',
    'Consent line to reply with:',
    '',
    `  I, ${ctx.ownerFullName || ctx.ownerFirstName || '[your full name]'}, consent to Guavo Inc. sharing the application information described above with its broker and funding partners for the purpose of exploring alternative financing on my behalf.`,
    '',
    'Any questions, just reply or call (714) 400-2237.',
  ];

  return {
    subject: ctx.refId
      ? `${twoOrThree} quick items for your Guavo application (Ref ${ctx.refId})`
      : `${twoOrThree} quick items for your Guavo application`,
    html: shell.emailShell({ heading, subheading, bodyHtml }),
    text: shell.textShell({ heading, bodyLines }),
  };
}

function missingFields(ctx) {
  const missing = [];
  if (!ctx.ownerFullName && !ctx.ownerFirstName) missing.push('Owner First Name or Last Name');
  if (!ctx.businessName) missing.push('Business Legal Name');
  return missing;
}

module.exports = { build, missingFields };
