// Dispatch table mapping Monday Next Steps label text → template module.
// Send-next-steps endpoint reads the item's Next Steps column and looks the
// label up here. If a label is not in this table, the endpoint treats it as
// "no applicant email for this step" and posts an explanatory Update instead
// of guessing.
//
// Add a new template by dropping a file in this directory and adding an entry
// below. Keys must match the exact label text on Monday column color_mm44sz50
// (case-sensitive).

module.exports = {
  'Unlock Experian':      require('./unlock-experian'),
  'Get broker consent':   require('./get-broker-consent'),
  'Send follow-up email': require('./send-follow-up-email'),

  // Templates worth adding next (when the specific ask is well-defined):
  //   'Request info from applicant' — needs a companion Long Text column
  //     ("Info requested") that the underwriter fills before clicking, so
  //     the template can embed the exact ask.
  //   'Send app form' — link to the guavo.com/apply page.
  //   'Chase application' — nudge after app link was sent but not submitted.
  //   'Send proposal' — likely stays manual per-deal; a proposal is deal-
  //     specific enough that a template would flatten it.
  //   'Contact in a few months' — future re-engagement, likely a cron-fired
  //     scheduled send rather than a button click.
};
