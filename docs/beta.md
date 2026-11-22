# Beta

The beta is a separate deployment for a small group of real people. It has its own Worker (`campfire-beta`), D1 database, R2 bucket, queue, Durable Objects, secrets and address. It is not a test target: nothing automated signs in to it.

## Deploy

`script/deploy --env beta --no-build` provisions what is missing, applies migrations and deploys. The address comes from `routes` in `env.beta` (a custom domain), and `APP_URL` is set from the same host, so sign-in links and the AT Protocol client document use it.

Migrations only go forward. `script/deploy` does not take a backup. Before it applies migrations, ask the backup Worker for one (see Backups) and check that it succeeded.

## Going back

- **Code:** `script/rollback --env beta` puts the version before the current one back. `script/rollback --env beta --list` shows recent versions, and `script/rollback --env beta <version-id>` picks one. The database is not touched, so the older code has to work with the newer schema: migrations add and reshape; they do not take away what an older version reads.
- **Data, in place:** D1 Time Travel keeps every state of the database for 30 days. `wrangler d1 time-travel info campfire-beta --env beta` prints the current bookmark and `wrangler d1 time-travel restore campfire-beta --env beta --timestamp <unix-time>` (or `--bookmark <id>`) rewinds to it. Restoring prints the bookmark of the state it replaced, so it can be undone.
- **Data, from a backup:** see below. Use this when the database itself is gone or the problem is older than Time Travel.

## Backups

A small separate Worker (`script/backup`, deployed by `script/backup-deploy`) writes a gzip file of every ordinary table to the R2 bucket `campfire-beta-backups`:

- `daily/<date>.sql.gz`, every day at 10:30 UTC;
- `pre-migration-<label>/<time>.sql.gz`, taken when asked: `POST /run?label=pre-migration-<label>` on the Worker's address, with the header `Authorization: Bearer <BACKUP_TOKEN>`. It answers with the key, the row count and the latest migration in the backup. `GET /latest` with the same header describes the newest daily backup.

A bucket rule deletes both kinds after 30 days. The search index is left out (FTS5 tables cannot be exported); it is rebuilt after a restore. Files in the R2 bucket `campfire-beta` (uploads and the stored contents of notes) are not in the backup.

### Restore from a backup

1. Fetch it: `wrangler r2 object get campfire-beta-backups/daily/<date>.sql.gz --file backup.sql.gz --remote`.
2. `script/restore backup.sql.gz <new-database-name>` makes a database, applies the migrations, loads the backup and rebuilds the search index. It refuses to write into a deployment's own database.
3. To switch the beta to the restored database, put its id in `env.beta.d1_databases` in `wrangler.jsonc` and deploy. To read from it first, query it with `wrangler d1 execute`.
