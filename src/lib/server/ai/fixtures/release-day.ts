import type { SourceUnit } from '../grounded';

const post = `For the last two months we have shipped every Friday afternoon, and it is starting to hurt. Three of the last eight releases needed a hotfix over the weekend, and each time the person on call was alone because everyone else had logged off. Support also told me that customer tickets pile up on Saturday mornings, when nobody is around to answer them.

I would like us to move the weekly release to Tuesday at 11am, starting the week of March 9. Tuesday gives us Monday to finish reviews and run the full regression suite, and it leaves the rest of the week to catch problems while the whole team is online.

Here is what would change. The release branch would be cut on Monday at 3pm instead of Thursday at 3pm. The code freeze moves with it, so anything not merged by Monday afternoon waits for the next week. QA would run the regression suite on Monday evening and Tuesday morning. The release manager rotation stays the same, but the release manager would post the changelog in the announcements channel by Tuesday noon.

There are costs. Marketing currently plans its product emails around Friday launches, and they would need to move their send day. Our mobile apps go through store review, which usually takes one to two days, so mobile releases would land on Wednesday or Thursday rather than over the weekend. And the first week will be awkward, because the Friday release on March 6 and the Tuesday release on March 10 would be only two working days apart.

I considered Wednesday as well. It would give QA one more day, but it pushes mobile releases into Friday again, which brings back the weekend problem we are trying to fix.

What I need from you: please say whether this works for your team, and flag anything that would break. I would especially like to hear from support, marketing and the mobile team. If there are no blockers by Friday, I will write up the final schedule and share it at the all-hands next Monday.

To be clear, this is a proposal, not a decision yet. If the timing is wrong we can wait until after the April launch.`;

/** A realistic post of about 400 words and its 8 comments and replies, as `discussionUnits` lays them out. */
export const releaseDay: SourceUnit[] = [
	{
		author: 'Priya Shah',
		kind: 'title',
		text: 'Proposal: move weekly releases from Friday to Tuesday'
	},
	{ author: 'Priya Shah', kind: 'post', text: post },
	{
		author: 'Marcus Lee',
		kind: 'comment 1',
		text: 'Support is strongly in favour. Saturday mornings are our worst queue of the week, and most of those tickets come from Friday releases. One request: could the changelog go out by 10am on Tuesday instead of noon? Our agents need it before the first questions arrive.'
	},
	{
		author: 'Priya Shah',
		kind: 'reply to comment 1',
		text: 'Marcus, 10am is fine. I’ll update the proposal so the changelog is posted by 10am on Tuesday.'
	},
	{
		author: 'Dana Okafor',
		kind: 'comment 2',
		text: 'Marketing can move our product emails to Wednesday. We need the final feature list by Monday at 5pm so we can write the copy. The March 6 to March 10 overlap is fine for us, since we had nothing planned that week.'
	},
	{
		author: 'Tomás Rivera',
		kind: 'comment 3',
		text: 'From the mobile side, Tuesday works better than Wednesday. Store review has been taking about 36 hours lately, so a Tuesday release should reach users by Thursday. I would like the mobile release branch to be cut at the same time as the web one so the versions match.'
	},
	{
		author: 'Hannah Berg',
		kind: 'comment 4',
		text: 'QA can run regression on Monday evening, but only if the branch is cut by 3pm sharp. Last quarter the cut slipped to 5pm or later about half the time, and then we had no time to finish. Can we make the cut time a hard rule?'
	},
	{
		author: 'Priya Shah',
		kind: 'reply to comment 4',
		text: 'Agreed, Hannah. The cut at 3pm on Monday will be a hard rule, and late changes wait for the next release.'
	},
	{
		author: 'Sam Whitfield',
		kind: 'comment 5',
		text: 'This looks good to me. My only worry is the April launch, which falls on a Tuesday. I would rather we do one more Friday release before it than move the launch.'
	},
	{
		author: 'Priya Shah',
		kind: 'reply to comment 5',
		text: 'Sam, the April launch is on Tuesday April 14, which would just become a normal release day. I don’t think we need an extra Friday release, but let’s talk about it at the all-hands.'
	}
];
