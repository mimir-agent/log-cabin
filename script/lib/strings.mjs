/**
 * Every line that script/update, script/restore-backup, script/release, script/deploy-builds and
 * script/check-upstream-release print. Replace each {name} with its value before printing. A line
 * ending in a space is a prompt; print it without a newline. These lines appear in terminals and
 * build logs, so they are plain text.
 */
export const strings = {
	update: {
		usage: [
			'Usage: script/update [--to <version>] [options]',
			'       script/update --rollback [--restore-db]',
			'',
			'Updates this deployment to the newest release, or to the one given with --to.',
			'Before migrating the database, it records a Time Travel bookmark and saves a backup.',
			'',
			'Options:',
			'  --to <version|sha>     the release to update to (default: the newest)',
			'  --from <version>       the release this deployment runs, if it has no version tag',
			"  --yes                  don't ask before updating",
			"  --manual-steps-done    continue after doing a release's manual step",
			'  --allow-local-commits  update even though your checkout has commits on top of a release',
			'  --backup-to-r2         also upload the backup to the R2 bucket, under _backups/',
			'  --keep-checkout        leave your checkout where it is',
			'  --prebuilt <dir>       deploy an unpacked build instead of building one',
			'  --env staging|test     update the staging or test deployment',
			'  --rollback             go back to the Worker version from before the last update',
			'  --restore-db           with --rollback, also restore the database to the bookmark'
		],

		/* Preflight. Each refusal stops the run before anything changes. */
		notLoggedIn: 'Not logged in to Cloudflare. Run: pnpm wrangler login',
		dirtyTree:
			"Your checkout has changes that aren't committed:\n{files}\nCommit or stash them, then run script/update again. Untracked instance.jsonc and backups/ can stay.",
		localCommits:
			"Your checkout has {count} commits on top of v{version}. The update deploys v{to} as released, without them. To go ahead anyway, run script/update --allow-local-commits. If you've changed Log Cabin's code, see docs/updating.md for updating a fork instead.",
		lockHeld:
			'Another update started at {time} (process {pid}). Wait for it to finish. If that process has stopped, delete {lockFile} and run script/update again.',
		versionNotFound: 'Found no release v{version} on {remote}. The newest is v{latest}.',
		alreadyAt: 'Already at v{version}. Nothing to do.',
		olderTarget:
			'v{to} is older than v{from}, which this deployment runs. To go back after an update, run script/update --rollback.',
		majorNeedsFrom:
			"v{to} is a major release, and this deployment has no version tag, so script/update can't tell which release it runs. Run it again with --from <version>, giving the release you last deployed.",
		majorNeedsBackup:
			'v{to} is a major release, so it is only installed after a backup taken in this same run. The backup failed, so nothing was migrated. Fix the error above and run script/update again.',
		noTerminal:
			"There's no terminal to ask for confirmation. To update without asking, run script/update --yes.",

		/* Steps, in order. */
		fetching: 'Fetching release tags from {remote}',
		current: 'This deployment runs v{version}',
		currentUnknown:
			'This deployment has no version tag. It was deployed before Log Cabin had numbered releases.',
		currentFrom: 'Taking this deployment as v{version} (--from)',
		target: 'Updating {worker} from v{from} to v{to}',
		targetCommit: "Updating {worker} to commit {sha}, which isn't a release",
		worktree: 'Checking out v{to} in {path}',
		prebuilt: 'Using the build in {dir}',
		resuming: 'Continuing the update to v{to}. Finished steps are skipped.',

		/* What the update will do, shown before the prompt. */
		releaseHeading: 'v{version}, released {date}',
		whatsNew: "What's new",
		upgradeNotes: 'Upgrade notes',
		migrationsHeading: 'Migrations to apply to {database}:',
		migration: '  {file} ({class})',
		migrationClass: {
			addsOnly: 'adds only',
			breaking: 'breaking',
			safe: 'marked safe'
		},
		noMigrations: 'No migrations to apply.',
		manualHeading: 'Manual steps:',
		manualBefore: '  Before migrating: {step}',
		manualAfter: '  After the update: {step}',
		majorWarning:
			'v{to} is a major release. Its migrations change data that v{from} relies on, so going back to v{from} afterwards also means restoring the database. Read its upgrade notes above first.',
		confirm: 'Update {worker} to v{to}? [y/N] ',
		declined: 'Stopped. Nothing has changed.',

		bookmarkStart: 'Recording a Time Travel bookmark for {database}',
		bookmarkDone: 'Bookmark: {bookmark}',
		backupStart: 'Backing up {database} to {file}',
		backupTable: '  {table}: {rows} rows',
		backupSkipped:
			'  Skipped the search tables ({tables}). script/reindex rebuilds them after a restore.',
		backupDone: 'Backup saved: {file} ({size}, sha256 {sha256})',
		backupReused: 'Using the backup already taken for this update: {file}',
		backupFailed: "Couldn't back up {database}: {error}",
		r2Start: 'Uploading the backup to R2 bucket {bucket} as {key}',
		r2Done: 'Uploaded: {bucket}/{key}',

		manualStop:
			"v{version} has a manual step to do before its migrations:\n  {step}\nThe database hasn't been migrated yet. Do the step, then run:\n  script/update --to v{to} --manual-steps-done",

		migrateStart: 'Applying {count} migrations to {database}',
		migrateDone: 'Migrations applied',
		migrateFailed:
			"A migration failed, so v{to} wasn't deployed: {error}\nOnce the cause is fixed, run script/update again. Finished steps aren't repeated.",
		deployStart: 'Deploying v{to}',
		deployDone: 'Deployed as Worker version {workerVersion}',
		verifyStart: 'Checking {url}/api/version',
		verifyDone: '{url} runs v{version}',
		verifyFailed: 'Expected {url}/api/version to return v{expected}; got {found}.',
		checkoutStart: 'Moving your checkout to v{to}',
		checkoutKept: 'Left your checkout where it was (--keep-checkout)',

		/* The last thing printed after a successful update. */
		summary: {
			done: 'Updated {worker} from v{from} to v{to}.',
			bookmark: 'Database bookmark from just before the update: {bookmark}',
			backup: 'Backup: {file}',
			rollback: 'To go back to v{from}: script/update --rollback',
			restore:
				'To go back and also restore the database to that bookmark: script/update --rollback --restore-db',
			restoreCommand:
				'That restore runs: pnpm wrangler d1 time-travel restore {database} --bookmark={bookmark}',
			window: 'Time Travel keeps bookmarks for 7 days on Workers Free and 30 days on Workers Paid.',
			afterHeading: 'Still to do for v{to}:',
			after: '  {step}'
		}
	},

	/* script/update --rollback, with and without --restore-db. */
	rollback: {
		noState:
			"Found no update recorded in {stateFile}, so there's nothing to roll back to. Run --rollback from the checkout that ran the update.",
		noBookmark:
			"Found no bookmark recorded in {stateFile}, so there's nothing to restore the database to.",
		start: 'Rolling {worker} back to Worker version {workerVersion}, the one before v{to}',
		done: '{url} runs v{version} again',
		restoreWarning:
			'This restores {database} to bookmark {bookmark}, recorded at {time}, just before the update to v{to}. Everything written to the database since then is deleted, including posts, comments, messages and notes.',
		/** The reader types this back to confirm. */
		phrase: 'restore {database}',
		typePrompt: 'Type "{phrase}" to continue: ',
		mismatch: "That doesn't match, so the database was left as it is.",
		restoreStart: 'Restoring {database} to bookmark {bookmark}',
		restoreDone:
			'Restored {database}. To undo this restore: pnpm wrangler d1 time-travel restore {database} --bookmark={undoBookmark}'
	},

	/* script/restore-backup <backup.json>: loads a saved backup into an empty database. */
	restoreBackup: {
		usage: [
			'Usage: script/restore-backup <backup.json>',
			'',
			'Loads a backup saved by script/update into an empty database, then rebuilds search.',
			'Use it to move to a new Cloudflare account or to restore from further back than Time Travel keeps.'
		],
		badFile: 'Expected a Log Cabin backup in {file}; {reason}.',
		checking: 'Checking that {database} is empty',
		notEmpty:
			'{database} already holds data, so nothing was loaded. A backup only loads into an empty database: deploy a new copy with script/deploy, then restore into its database before you open /setup.',
		reading: 'Reading {file} (sha256 {sha256})',
		loadTable: '  {table}: {rows} rows',
		reindex: 'Rebuilding the search index',
		countMismatch: 'Expected {expected} rows in {table} after loading; found {found}.',
		done: 'Restored {rows} rows in {tables} tables from {file}. Every row count matches the backup.'
	},

	/* script/release prepare | tag | check. */
	release: {
		usage: [
			'Usage: script/release prepare <version>',
			'       script/release tag',
			'       script/release check',
			'',
			'  prepare  start release/v<version> from main, with its release notes, CHANGELOG.md and releases.json',
			'  tag      tag the merged release commit and push the tag',
			'  check    check that the release files agree with each other'
		],
		dirtyTree:
			"Your checkout has changes that aren't committed:\n{files}\nCommit or stash them, then run script/release again.",
		invalidVersion: 'Expected a version like 1.2.0; got {version}.',
		tagExists: 'v{version} is already tagged.',
		notNewer: "v{version} isn't newer than v{latest}, the newest release.",
		breakingNotMajor:
			'Migrations since v{previous} include breaking changes ({files}), so this release has to be v{major}.0.0.',
		branch: 'Creating branch release/v{version} from main',
		classify: 'Classifying migrations since v{previous}',
		notes: 'Writing releases/{version}.md',
		draft: "Drafted What's new from {count} commits",
		version: 'Setting the package.json version to {version}',
		generate: 'Regenerating CHANGELOG.md and releases.json',
		committed: 'Committed "release: v{version}"',
		next: "Next: rewrite the draft What's new and write the Upgrade notes in releases/{version}.md, amend the commit, then push the branch and open a pull request.",

		notMain: "Expected to be on main; you're on {branch}.",
		notReleaseCommit:
			'Expected the commit at HEAD to have the subject "release: v<version>"; its subject is "{subject}".',
		tagged: 'Tagged v{version} at {sha}',
		pushed: 'Pushed v{version} to {remote}',
		noRemotes: 'Found none of the remotes {remotes}, so v{version} is tagged here only.',

		versionMismatch:
			'package.json has version {version}, but the newest release file is releases/{latest}.md.',
		generatedStale:
			"{file} doesn't match what script/release prepare generates from releases/. Generate it again and commit it.",
		migrationMismatch:
			'releases/{version}.md lists {file} as {listed}, but check-migrations classes it as {found}.',
		breakingMismatch:
			'releases/{version}.md has breaking: {listed}, but its migrations make it {found}.',
		guidanceLeft:
			"releases/{version}.md still has the template's guidance comments. Delete them before the release.",
		checkPassed: 'Release files agree.'
	},

	/* script/deploy-builds: the deploy command Workers Builds runs on every push. */
	deployBuilds: {
		production:
			'{branch} is the production branch: recording a bookmark, applying migrations and deploying v{version}',
		preview:
			"{branch} isn't the production branch, so this uploads a preview version and leaves the database alone.",
		bookmark: 'Bookmark before migrating {database}: {bookmark}',
		bookmarkSaved: 'Saved the bookmark to R2: {bucket}/{key}',
		restoreCommand:
			'To restore the database to it: pnpm wrangler d1 time-travel restore {database} --bookmark={bookmark}',
		majorRefused:
			'v{version} is a major release with breaking database changes, so nothing was migrated or deployed. Read its upgrade notes, then set the build variable LOG_CABIN_ALLOW_MAJOR={major} and retry the build.',
		majorWrongValue:
			'LOG_CABIN_ALLOW_MAJOR is {value}, but v{version} is major version {major}, so nothing was migrated or deployed. Set it to {major} and retry the build.',
		majorAllowed: 'v{version} is a major release, allowed by LOG_CABIN_ALLOW_MAJOR={major}',
		migrateStart: 'Applying {count} migrations to {database}',
		noMigrations: 'No migrations to apply',
		migrateDone: 'Migrations applied',
		deployed: 'Deployed v{version}',
		uploaded: 'Uploaded preview version {workerVersion}'
	},

	/* script/check-upstream-release and the pull request it opens in a copy of the repository. */
	upstream: {
		noUpstream:
			"No upstream repository is set (logCabin.upstream in package.json), so there's nothing to check.",
		isUpstream: "This is the upstream repository, so there's nothing to update.",
		upToDate: 'Up to date: v{version} is the newest release of {upstream}.',
		prOpen: 'A pull request for v{version} is already open: {url}',
		opened: 'Opened a pull request for v{version}: {url}',
		prTitle: 'Update Log Cabin to v{version}',
		/** For a major release, prBodyMajor goes after the first paragraph. */
		prBody: [
			'This merges Log Cabin v{version} from {upstream}.',
			'',
			"Merging it deploys the update through Workers Builds, which records a database bookmark before it applies the migrations. The bookmark's restore command is in the build log.",
			'',
			"## What's new",
			'',
			'{whatsNew}',
			'',
			'## Upgrade notes',
			'',
			'{upgradeNotes}'
		],
		prBodyMajor:
			"v{version} is a major release. Workers Builds won't deploy it until you set the build variable LOG_CABIN_ALLOW_MAJOR={major}. Read the upgrade notes first."
	}
};
