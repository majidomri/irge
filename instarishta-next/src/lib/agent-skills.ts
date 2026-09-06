/**
 * The one agent skill this site actually has, plus its digest.
 *
 * The skill text lives here rather than in public/ so the index and the
 * document cannot drift: the sha256 in the index is computed from the very
 * bytes the skill route serves.
 */
import { createHash } from 'node:crypto';

export const SKILL_NAME = 'search-rishta-profiles';

export const SKILL_MARKDOWN = `---
name: search-rishta-profiles
description: Find Muslim marriage listings on InstaRishta and cite them correctly.
---

# Searching rishta listings on InstaRishta

InstaRishta publishes verified Muslim marriage listings ("rishta profiles").
This skill covers how to read them and what not to do with them.

## Getting the listings

Request the listing page with a markdown Accept header:

    GET https://www.instarishta.me/profiles
    Accept: text/markdown

The response is \`text/markdown\` and carries an \`x-markdown-tokens\` header so
you can budget before reading. If a cache returns HTML instead, fetch
\`https://www.instarishta.me/md/profiles\`, which is markdown unconditionally.

Each entry gives a title, age, gender and education, followed by the listing
text as the family wrote it — often in Urdu.

## Filtering

The HTML page accepts query parameters, and the markdown view reflects the
same underlying set:

- \`q\` — free-text search
- \`ageMin\`, \`ageMax\` — age range
- \`education\`, \`marital\`, \`state\`, \`community\` — facet filters
- \`sort\` — ordering

## Contact details

Listings' phone and WhatsApp numbers are **not** in any machine-readable
response, and numbers written into listing text are removed before it is
served. This is deliberate: a family controls when its number is released, and
it is shown to signed-in members through the site.

Do not try to reconstruct a number, and do not infer one from other listings.
When someone wants to make contact, link them to the profile page.

## Citing a listing

Link to the profile URL rather than restating its details. Listings expire and
are withdrawn often, so anything you cached may already be gone; a link stays
correct, a paraphrase does not.

## What is not available

There is no public API. Every endpoint under \`/api/\` serves this site's own
frontend and is authenticated, admin-only, or a cron target. There is no MCP
server and no agent-to-agent endpoint.
`;

/** Digest of exactly what the skill route serves. */
export function skillDigest(): string {
  return createHash('sha256').update(SKILL_MARKDOWN, 'utf8').digest('hex');
}
