# Context

Constraints and gotchas that aren't obvious from the code.

- **One organization per deployment.** No sign-up, no multi-tenancy. Until the `org` row exists every page redirects to `/setup`; after that `/setup` is a 404. `SETUP_TOKEN`, when set, stops a stranger from claiming a fresh public deploy.
- **Cloudflare only, one Worker.** Pages, queue consumer, crons and Durable Objects deploy together from `wrangler.jsonc`. Nothing else is hosted.
- **Bindings come from `cloudflare:workers`.** The adapter doesn't pass `event.platform`; use `getEnv()`.
- **Workers AI has no local mode.** Run `wrangler dev --local`, which leaves it out.
- **Sign-in, and no AT Protocol.** Sign-in is an emailed link, Google when its keys are set, or a password a member chooses in settings. Passwords are PBKDF2 at 100,000 iterations, the most Workers' WebCrypto allows, and are checked against Have I Been Pwned's range API. A reset link mailed to the member works once for 30 minutes and ends every session. Two-factor is an authenticator code or one of ten single-use recovery codes; once on, every sign-in method asks for it. Five wrong passwords, or five wrong codes, in 15 minutes lock that form for the rest of the window, counted even when the requests arrive at once.
- **Roles are Campsite's four:** admin, member, viewer, guest. Guests see only projects they're added to.
- **Licence.** The repo is CC BY-NC 4.0. Files adapted from Campsite carry a header naming the source path and commit `cc14551` and are listed in `NOTICE`. The name "Campsite" and its logos are not used. `@taurean/suede-css` has its own licence (see `NOTICE`).
- **Staging never sends real mail.** It runs `EMAIL_TRANSPORT=log` and reads mail at `/__mail?token=…`. Production never sets `MAIL_VIEWER_TOKEN`.
