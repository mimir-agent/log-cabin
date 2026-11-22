# Testing

Automated tests, probes and audits run in one of three places. The beta and production are never used for tests: real people use them, and a test that posts, comments or sends mail there leaves its mess in their inboxes.

## Where tests run

| Where                | Start it                                                                           | Data                                                                     |
| -------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| End-to-end server    | `pnpm test:e2e`, or `node tests/e2e/serve.ts` after `pnpm build`                   | The people in `tests/e2e/fixtures.ts`, in `.wrangler/e2e`, fresh per run |
| Local `wrangler dev` | `scripts/reset-test.sh --local`, then `pnpm build` and `pnpm wrangler dev --local` | The Campfire Test org, in `.wrangler/state`                              |
| campfire-test        | `script/deploy --env test`, then `scripts/reset-test.sh --env test`                | The Campfire Test org, in the `campfire-test` D1 database                |

campfire-test is its own Worker, with its own D1 database, R2 bucket and queue. It never sends mail: with `EMAIL_TRANSPORT=log` it keeps each message for `/__mail`. If a Resend key, a Postmark token or the `EMAIL` binding is set on it, or the transport is anything but `log`, it logs a warning and sends nothing.

## The Campfire Test org

`scripts/seed-test.js` writes the same org every time: six fake people, three projects, 54 posts with 162 comments, five notes, four chat threads with 200 messages, reactions, and a few notifications for each person. All the text is generated. Every address is at `campfire-test.example`, a reserved domain that can't receive mail.

| Person | Email                        | Role                       |
| ------ | ---------------------------- | -------------------------- |
| Ada    | `ada@campfire-test.example`  | admin                      |
| Ben    | `ben@campfire-test.example`  | member                     |
| Cleo   | `cleo@campfire-test.example` | member                     |
| Dev    | `dev@campfire-test.example`  | member                     |
| Fay    | `fay@campfire-test.example`  | member                     |
| Eli    | `eli@campfire-test.example`  | guest, in Launch Plan only |

## Sign in on campfire-test

1. Set a mailbox token on the test Worker once: `pnpm wrangler secret put MAIL_VIEWER_TOKEN --env test`. Use a value of its own, never the beta's.
2. Ask for a sign-in link for one of the people above on the sign-in page.
3. Open `/__mail?token=<the token>` on the same Worker and follow the link in the newest message.

## Reset

```sh
scripts/reset-test.sh --env test   # campfire-test
scripts/reset-test.sh --local      # local wrangler dev
```

The reset applies any new migrations, empties every app table and seeds the org again. It keeps the migration history. Files in R2 and saved live-note documents stay, but the new rows have new ids, so nothing points at them.

Both scripts refuse a remote database that isn't `campfire-test` and stop before contacting Cloudflare, so `--env beta` and a bare run (production) fail with an error.
