# Log Cabin

Log Cabin is a place for one organization's async discussions: posts, comments, chat, notes and calls. You host it yourself on your own Cloudflare account. One deployment serves one organization.

It's early. Parts of what this README describes are still being built.

Log Cabin is source-available and free to self-host. Any organization can run it for its own internal use, which Campsite's licence counts as non-commercial use. The licence forbids commercial use, so you can't sell Log Cabin or sell hosting for it, and it doesn't meet the Open Source Definition.

Log Cabin is built from the design of [Campsite](https://github.com/campsite/campsite), with attribution. It is a modified rebuild, not affiliated with or endorsed by Campsite. [NOTICE](NOTICE) has the details and lists the files adapted from Campsite.

## Requirements

- A Cloudflare account. The Workers Free plan includes D1, R2, Queues and SQLite-backed Durable Objects with daily limits. The Workers Paid plan raises those limits.
- Node 22 or later.
- pnpm.
- wrangler, which `pnpm install` installs as a dev dependency.

## Deploy

```sh
pnpm install
pnpm wrangler login
script/deploy
```

`script/deploy` does the following:

1. Creates the D1 database, R2 bucket and queue if they don't exist yet.
2. Writes the D1 database id into `wrangler.jsonc`.
3. Applies the database migrations to the remote database.
4. Generates `SESSION_SECRET`, `SETUP_TOKEN`, `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, plus `ATPROTO_CLIENT_KEY` (the key for signing in with AT Protocol), and sets them as secrets. It does this only the first time.
5. Deploys the Worker.
6. Sets `APP_URL` to the Worker's URL, the first time only. Notification emails link to it. If you add a custom domain, set it again with `pnpm wrangler secret put APP_URL`.
7. Prints the URL and the setup token.

You can run it again safely. It skips anything that already exists.

`script/deploy --env beta` deploys a separate Worker, `campfire-beta`, with its own database, bucket and queue (see [docs/beta.md](docs/beta.md)). `script/deploy --env test` does the same for `campfire-test`, the deployment automated tests run against (see [docs/testing.md](docs/testing.md)).

`script/deploy --no-build` skips `pnpm build` and deploys what is already in `.svelte-kit`. CI uploads its build of each commit as the `staging-build` artifact. Unpack it into `.svelte-kit/` in a checkout of the same commit, then run `pnpm install --frozen-lockfile` and `script/deploy --env beta --no-build`. Before it contacts Cloudflare, `--no-build` checks that the Worker and server files in `.svelte-kit` (under `cloudflare/`, `cloudflare-tmp/` and `output/`) are there and not empty, and that the client assets are in `cloudflare/_app/`. Before any deploy applies migrations, it bundles the Worker without uploading it and starts it locally with `wrangler check startup`. A build that won't bundle, or a Worker that fails at startup, stops before the database changes.

## Deploy to Cloudflare button

Cloudflare's Deploy to Cloudflare button isn't set up for this repository yet, so use `script/deploy`.

## First run

1. Open the URL that `script/deploy` printed. Log Cabin sends you to `/setup`.
2. Enter the setup token from the deploy output, the organization's name, and your name and email.
3. You become the first admin, and Log Cabin emails you a sign-in link.

## Email

Set the `EMAIL_TRANSPORT` variable in `wrangler.jsonc` to choose how Log Cabin sends mail:

| Value        | Sends with                                                                 | Needs                                                                                    |
| ------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `log`        | Nothing. Writes each message to the `dev_mail` table. This is the default. | Nothing                                                                                  |
| `cloudflare` | Cloudflare Email Routing, through the `EMAIL` send_email binding           | Email Routing on your zone, and the `send_email` binding uncommented in `wrangler.jsonc` |
| `resend`     | Resend                                                                     | The `RESEND_API_KEY` secret                                                              |
| `postmark`   | Postmark                                                                   | The `POSTMARK_TOKEN` secret                                                              |

`EMAIL_FROM` sets the sender address.

To send with Resend, add and verify your domain in Resend, then create an API key there and set it as the `RESEND_API_KEY` secret. Set `EMAIL_TRANSPORT` to `resend` and `EMAIL_FROM` to an address at the domain you verified.

Log Cabin emails sign-in and password reset links, invites, join requests and their answers, notifications still unread after 10 minutes, and the daily and weekly digests. Each member chooses which notifications reach them by email, and whether and when digests come, under **Notifications**.

With `log`, you can read the stored mail at `/__mail?token=...` if you set the `MAIL_VIEWER_TOKEN` secret and pass the same value as `token`. Without that secret, `/__mail` stays closed. Use it on the beta and the test deployment only. Never set `MAIL_VIEWER_TOKEN` in production.

Set a secret with:

```sh
pnpm wrangler secret put NAME
```

Add `--env beta` to set it on the beta Worker.

## Optional

- **Google sign-in** needs the `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` secrets. Once they're set, an admin turns it on in the organization settings.
- **Summaries** of posts, notes and chat threads use Workers AI through the `AI` binding, and an admin can turn them off in the organization settings. To run without Workers AI, remove the `ai` lines from `wrangler.jsonc`, and the Summarize button stays hidden. See [AI summaries](#ai-summaries) for the model and how each summary is checked.
- **Calls** need a Cloudflare Realtime SFU app. Create one under Realtime in the Cloudflare dashboard, then set its ID and token as the `REALTIME_APP_ID` and `REALTIME_APP_TOKEN` secrets. Until both are set, the call buttons don't show. People on networks that block direct media also need a TURN key: create one under Realtime and set `REALTIME_TURN_KEY_ID` and `REALTIME_TURN_KEY_TOKEN`. `script/deploy` prints these steps while calls are off.
- **Image resizing** uses the `IMAGES` binding, which is commented out in `wrangler.jsonc`. It needs Cloudflare Images on the account.

## Passwords and two-factor

Members can set a password under **Password and security** and then sign in with it, as well as by emailed link or Google. A password needs at least 10 characters. When someone sets or changes one, Log Cabin asks [Have I Been Pwned](https://haveibeenpwned.com/Passwords) whether it has appeared in a data breach, and refuses it if it has. Only the first five characters of the password's SHA-1 hash are sent. If the service can't be reached, the password is accepted. Passwords are stored as PBKDF2-SHA256 hashes with 100,000 iterations.

After 5 wrong passwords for one email address in 15 minutes, or 5 wrong two-factor codes for one account, more tries are refused for up to 15 minutes. A password reset link works once, expires in 30 minutes, and signs the member out on every device.

Two-factor authentication uses an authenticator app, with ten single-use recovery codes for a lost device. Once a member turns it on, they enter a code every time they sign in, by link, password or Google. Only the member can see or change it; admins can't.

## AI summaries

Two models from Cloudflare's Workers AI catalog write and check each summary, both with `reasoning_effort: "low"` to keep the wait short (`SUMMARY_MODEL` and `CHECK_MODEL` in `src/lib/server/ai/grounded.ts`):

- `@cf/zai-org/glm-5.3` writes the bullets. It is Z.ai's flagship and has no retirement date. On a test thread of a 400-word post and 8 comments it wrote four or five bullets that held up in each of six runs. As the writer, Inkling 2 Small took more than twice as long, and Mistral Small 3.1 sent JSON that was cut off in two runs out of three.
- `@cf/thinkingmachines/inkling-2-small` checks them. Given twelve true and false points about that thread and a shorter one, it judged all twelve correctly in each of seven runs, in about 2 seconds. GLM-5.3 once let "Morgan priced tents" through for "I will price tents", and Mistral Small 3.1 let "about three days" through for "about 36 hours". DeepSeek V4.1 Flash and Gemma 4 were right every time but sometimes took over a minute.

One summary costs about 300 neurons, so the free allocation of 10,000 neurons a day covers about 30 summaries. A summary is stored and reused until the discussion changes. To see what your account can run, and the inputs a model takes:

```sh
pnpm wrangler ai models list
pnpm wrangler ai models schema @cf/zai-org/glm-5.3
```

Every summary is checked before anyone sees it:

1. The title, the body and each comment and reply (or a chat's latest messages) are split into numbered sentences, each tagged with its author and where it comes from, such as "comment 2".
2. The model answers with up to five bullets in JSON, each citing the numbers of the sentences it rests on.
3. The server drops any bullet that cites nothing or cites a sentence that doesn't exist. Then the check model reads each remaining bullet beside the sentences it cites, in one request, and the server drops every bullet it says they don't back up. A bullet may use other words than the discussion, but it can't add a name, a number, a decision or an assignment that its sentences don't state, or say something was done when they only plan it.
4. Each bullet's citation numbers link to its sources. A comment or chat message scrolls into view and is highlighted; the title and body link to their quotes, which are listed under the summary.

If no bullet passes, readers see a short note in place of the summary.

A discussion needs at least 120 words, counting its title, body, comments and replies (or a chat's latest messages), before the Summarize button appears. Below that, readers see a note that there's too little to summarize (`SUMMARY_MIN_WORDS` in `src/lib/server/ai/summaries.ts`).

`groundedSummary(env, units)` in the same file runs steps 1 to 3 on any list of `{ author, kind, text }`, such as the lines of a call transcript.

## Cal.com

Log Cabin can give meetings booked on [Cal.com](https://cal.com) a call link. It needs calls to be on (see Optional above) and the `SESSION_SECRET` secret, which `script/deploy` creates. Each member connects their own Cal.com account:

1. Create an API key in Cal.com under Settings → Developer → API keys. Log Cabin uses it to write each booking's call link onto the booking as its location, so the link appears in the confirmation and the calendar invite.
2. In Log Cabin, open **Calls → Cal.com bookings**, choose where your bookings' calls happen (your personal room, or a project you can post in), paste the API key and save. The page then shows your own subscriber URL and secret.
3. In Cal.com, add a webhook under Settings → Developer → Webhooks, or on the Webhooks tab of the event types that should use Log Cabin. Paste the subscriber URL and the secret, and choose the triggers Booking created, Booking rescheduled and Booking cancelled.

A member opening a booking's link starts its call where the booking's owner chose, or joins it if it's already going, and the call shows the booking's title and attendees. The booking's attendees who aren't members here use the same link to join as guests, without an account: they pick their name from the booking's attendees and get into that one call, with camera and microphone only, from 15 minutes before the booking starts until 2 hours after it ends. Cal.com signs every delivery, and each member's webhook refuses any delivery not signed with that member's secret.

An admin can turn Cal.com off for everyone under **Organization settings**. While it's off, every webhook answers 404, booking links stop working, and the Cal.com page is hidden. Members' connections are kept for when it's turned back on.

If your organization connected Cal.com before each member had their own connection, that connection now belongs to the earliest active admin. It keeps its secret and API key but gets a new subscriber URL, and the old URL answers 404. That admin copies the new URL from their **Calls → Cal.com bookings** page into the webhook in Cal.com.

If you host Cal.com yourself, set the `CALCOM_API_URL` variable to its API v2 base, such as `https://cal.example.com/api/v2`. Unset, Log Cabin uses `https://api.cal.com/v2`.

The secrets and API keys are stored encrypted with a key derived from `SESSION_SECRET`, and guest links are signed with another. To change `SESSION_SECRET`, have everyone disconnect Cal.com first and connect it again afterwards; booking links already sent stop working for guests. If it has already changed, every Cal.com page and delivery fails. Delete the saved connections and have everyone connect again:

```sh
pnpm wrangler d1 execute DB --remote --command "DELETE FROM calcom_connections"
```

## Live notes

Several people can edit a note at once and see each other's cursors. Each note being edited has its own Durable Object, which stores every change as it arrives. Five seconds after the last change, and when the last person leaves, it writes the whole document to the bucket at `notes/<id>/ydoc.bin` and the note's text to its database row, which search, summaries and the notes list read. A note written before live editing starts from its stored text the first time someone opens it.

## Call recordings

Anyone who can post where a call is held can record it, and everyone in the call sees a banner while it records. Recording needs calls (see Optional above), Workers AI, `APP_URL` and `SESSION_SECRET`; until all four are set, the Record button doesn't show.

The call service sends each person's audio to a Durable Object, which writes it to the bucket in one-minute WAV segments under `calls/<call id>/rec/`. Each segment is transcribed with `@cf/openai/whisper-large-v3-turbo`. The video is recorded in the browser of the person who started the recording and uploaded as one WebM file, so it stops if they leave the call; the audio keeps recording. A recording still running after 4 hours is stopped at the next hourly check.

When the call ends, and if AI summaries are on, Log Cabin writes its title and a summary in three parts (Summary, Topics, Next steps) from the transcripts, checked the same way as other [AI summaries](#ai-summaries). Anyone who can see the call can read its transcripts, play its recordings and read the summary on the call's page.

## Installing the app

Log Cabin can be installed as an app from the browser. In browsers that support installing, Log Cabin offers it with a prompt on Home; on an iPhone or iPad, people tap Share, then Add to Home Screen. The installed app's icon shows the unread count.

When the network is down, Log Cabin shows an offline page in place of the page that didn't load. The service worker caches only that page, fetched signed out, and the stylesheets; it never caches a signed-in page or an API answer.

## Search index

Search keeps itself up to date as people write. If you restore the database from a backup or search results look wrong, rebuild the index:

```sh
script/reindex                 # production
script/reindex --env beta      # the beta
script/reindex --local         # your local database
```

## Develop locally

```sh
pnpm install
pnpm wrangler d1 migrations apply DB --local
pnpm dev
```

`pnpm dev` runs the Vite dev server. To sign in without email, put `DEV_LOGIN=1` in `.dev.vars` and open `/dev/login`. The route works only in the dev server; a production build answers 404 even when `DEV_LOGIN` is set.

To run the whole Worker locally, including the fetch, queue and cron handlers:

```sh
pnpm build
pnpm wrangler dev --local --test-scheduled
```

This is for local testing only. It uses local copies of the database, bucket and queue. `--local` leaves out Workers AI, which has no local mode. To fire a cron, open `/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*`.

To fill the local database with the fake Campfire Test org that the test deployment uses, run `scripts/reset-test.sh --local`. It empties the local database first. [docs/testing.md](docs/testing.md) lists the people and where tests run.

Checks:

```sh
pnpm check      # types
pnpm lint       # prettier and eslint
pnpm test       # vitest
pnpm test:e2e   # builds, then drives live notes, posts, polls, drafts, call recording, and password and two-factor sign-in in real browsers against wrangler dev
```

`pnpm test:e2e` runs the Worker on port 8799 with its own local data in `.wrangler/e2e`, which it wipes and seeds on every run. Install its browser once with `pnpm exec playwright install chromium`.

## Licence

Log Cabin is licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). See [LICENSE](LICENSE) and [NOTICE](NOTICE).
