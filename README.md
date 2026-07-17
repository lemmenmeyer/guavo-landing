# guavo-landing

Static landing site for guavo.com plus two Vercel serverless functions.

## API endpoints

- `POST /api/submit-application` — receives the app-form submission from the
  client, sends the broker copy to `contact@guavo.com` and a confirmation copy
  to the applicant, both via Resend.
- `POST /api/send-decline` — triggered by the Monday "Send Decline Email"
  button on the Guavo Pipeline board (id 18416816603). Sends a compliant
  adverse-action notice to the applicant from `patti@guavo.com`.

## Environment variables

Set these in Vercel Project Settings → Environment Variables:

| Variable | Used by | Notes |
|---|---|---|
| `RESEND_API_KEY` | both | `re_...` key from resend.com/api-keys. |
| `RESEND_FROM` | submit-application | Optional. Defaults to `Guavo Applications <contact@guavo.com>`. |
| `RESEND_TO` | submit-application | Optional. Defaults to `contact@guavo.com`. |
| `MONDAY_API_TOKEN` | send-decline | Personal API v2 token from staura.monday.com → Developers → My access tokens. |
| `MONDAY_WEBHOOK_SECRET` | send-decline | Arbitrary long secret. The Monday button-click automation must include it as an `X-Guavo-Webhook-Secret` header on the webhook. |

## Decline templates

`lib/decline-templates/` — one file per Decline Reason label on Monday plus a
shared `common.js` module holding the ECOA + FCRA §615(a) + Experian address
blocks, the counsel-managed `APPROVED_STATES` allowlist, and per-state overlay
paragraphs.

`APPROVED_STATES` starts EMPTY. The endpoint fails closed on every state until
counsel adds it to the set. To roll out to a new state, edit `common.js` and
either add the state to `APPROVED_STATES` (no overlay needed) or add an
`if (key === 'XX')` branch inside `stateOverlayBlock` + `stateOverlayText`.

## Local template preview

Dry-run renderer at `~/.guavo-underwriting/dev/send_decline_dryrun.mjs`
imports the same template modules and writes HTML + plain-text previews to a
temp directory — used for counsel review before first live send. Never calls
Resend, never mutates Monday.

## Monday board dependencies

Column ids consumed by `/api/send-decline` are pinned in `api/send-decline.js`
under the `COL` object. If any of those columns are ever renamed or replaced
on Monday, update the corresponding id there.
