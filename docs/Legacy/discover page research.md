# ProjectFolio Discover deep research and implementation plan

**Status: historical design proposal.** External comparisons require source verification before reuse; the original conversation-only citation markers have been removed. See the [archive notes](README.md).

## Executive summary

Your current Discover feature is a solid baseline: users can create a post, attach one of their published projects, like posts, leave flat comments, follow makers, browse a recent or trending feed, and search across posts and portfolios. The backend already has good foundations such as cursor pagination, full-text search, stat tables, rate limits, and a reusable media pipeline; the frontend already ships with packages that can support a richer composer, uploads, and better data fetching. That means the problem is not that Discover is missing *everything*. The real problem is that it currently behaves like a minimal feed prototype instead of a project-centric professional discussion layer. Code references: `Frontend/Discoverpage.jsx:205-317, 372-730`; `Backend/discover.js:48-95, 203-539`; `Backend/media.js:36-107`; `Frontend/package.json`; `Backend/package.json`.

The best comparable products do not win with “more posts.” They win by giving the feed a **clear job**. LinkedIn’s feed is personalized around professional interests and activity, supports multiple post formats, lets users follow recommended sources, save posts, sort by relevance or recency, control who can comment, and view detailed post analytics.  Peerlist’s Scroll is explicitly a **context feed**, where every post has a context such as `#show`, `#ask`, `#hiring`, or `#open_for`, and Peerlist Launchpad turns project sharing into a structured launch flow with required fields, visibility, and feedback loops.  Product Hunt succeeds because a launch is a structured object, not just a text post: makers submit a URL, name, tagline, assets, and first comment, and comments are treated as a core feedback channel rather than a side action.  GitHub Discussions succeeds because it separates conversation types with categories, Q&A, polls, threaded replies, upvotes, accepted answers, and moderation tools. 

For ProjectFolio, the right direction is not to become “LinkedIn for projects.” It is to become the best place to **share project progress, ask for feedback, launch work, and hold useful asynchronous project discussions**. That implies three strategic changes. First, Discover needs **structured post types and stronger project objects**, not just title/body posts. Second, it needs **better ranking, discovery, and conversation tools** so useful discussions surface quickly. Third, it needs **trust, moderation, analytics, and creator feedback loops** so the feed stays high-signal and worth returning to. This direction aligns with Peerlist’s context-first design, Product Hunt’s launch structure, GitHub Discussions’ conversation patterns, and LinkedIn’s personalization and creator tooling. 

## What the current Discover feature already does

The current implementation already supports a meaningful but basic set of feed primitives. On the frontend, Discover has tabs for feed, makers, browse, and following; feed sub-tabs for recent, trending, and most liked; category chips; a create-post modal; post cards with likes and comments; maker cards with follow/unfollow; and a debounced search experience. Code references: `Frontend/Discoverpage.jsx:473-725`. On the backend, `/feed` supports cursor pagination, category filters, following-only filtering, and simple ranking by recency, likes, or a precomputed trending score. Search uses PostgreSQL full-text search and trigram similarity. The app also stores `post_stats` and `user_stats`, which is a good base for ranking and analytics. Code references: `Backend/discover.js:48-95, 166-196, 413-442`; `Backend/migrations/001_scalability_schema.sql:166-186`; `Backend/migrations/002_scalability_indexes.sql:24-29`.

A second strength is that the broader codebase already contains infrastructure you can reuse instead of rebuilding. The backend has a Cloudinary-backed upload signature and upload completion flow with type and size validation, metadata capture, and database persistence for media. Code reference: `Backend/media.js:36-107`. The frontend already includes Tiptap extensions, React Dropzone, and React Query in `package.json`, which means rich text, media uploads, and better async state management are already within reach without major dependency churn. Code reference: `Frontend/package.json`. The backend also uses Redis/BullMQ, which is useful for asynchronous preview generation, abuse checks, and media processing. Code reference: `Backend/package.json`.

That foundation matters, because it changes the implementation strategy. You do **not** need a ground-up rewrite of Discover. You need to preserve the current feed shell and progressively evolve four layers: composer, conversation model, discovery/ranking, and analytics/moderation. This makes the roadmap quite practical.

## Where the current implementation is falling short

The biggest product gap is that a post is currently too generic. The create-post flow only sends `title`, `body`, and an optional `project_id`, and the backend schema mirrors that simplicity. There is no post type, no context, no media attachment, no poll, no external link preview, no mention support, no audience or comment control, no draft state, no edit flow, and no save/share/report functionality. Code references: `Frontend/Discoverpage.jsx:227-315`; `Backend/discover.js:11-19, 203-237`. That is exactly where ProjectFolio feels “basic”: the product is asking users to create value with an underpowered composer.

The second gap is that the conversation model is too shallow for project discussion. Post cards only expose like and comment actions. Comments are flat, not threaded, limited to 100 recent rows, and cannot be upvoted, sorted, or marked as useful or resolved. There is no “accepted answer” mechanic for questions, no polls, no quote-reply, and no way for a project owner to turn a conversation into structured feedback. Code references: `Frontend/Discoverpage.jsx:182-200`; `Backend/discover.js:253-320`. In practice, this makes Discover better for lightweight reactions than for the kind of targeted feedback loops that project builders actually need.

The third gap is ranking and discovery quality. The feed currently supports `recent`, `trending`, and `liked`, but the ranking logic is minimal: `recent` is reverse chronology, `liked` is total likes, and `trending` depends on a simple score stored in `post_stats`. There is no personalization based on skills, follows, interests, mutuals, post quality, dwell, project relevance, or negative feedback. Code references: `Backend/discover.js:50-59, 77-83`; `Frontend/Discoverpage.jsx:479-483`. LinkedIn explicitly describes a feed that uses profile signals, interests, and engagement over time to personalize relevance, and also gives users a switch between top/relevant and recent.  Peerlist similarly uses mandatory post contexts so the feed can be sorted by what kind of content a user wants to see.  Right now, ProjectFolio has only the shell of a feed, not a truly useful discovery system.

There are also a few correctness issues in the current code that will directly hurt user trust if left unfixed:

| Area | Current behavior | Impact | Evidence |
|---|---|---|---|
| Search result shape | Backend returns `{ posts, portfolios }`, but the frontend renders `searchResults.people` | Maker results can fail to render on the discover page | `Backend/discover.js:413-442`; `Frontend/Discoverpage.jsx:529-541` |
| Follow state in makers tab | Backend returns `followed_by_viewer`, while the frontend initializes from `portfolio.following` | Follow buttons can show the wrong initial state | `Backend/discover.js:332-349`; `Frontend/Discoverpage.jsx:324-327` |
| Category model | Categories are derived from `projects.project_type` on attached-project posts only | Text-only discussions do not contribute to taxonomy or category discovery | `Backend/discover.js:399-406` |
| Post analytics | Stats endpoint only returns global totals and weekly comments | Creators get no per-post learning loop, and ranking lacks richer engagement signals | `Backend/discover.js:526-537` |
| Post actions | No edit, save, share, report, mute, hide, or moderation actions | Feed remains low-trust and low-utility versus benchmark products | `Frontend/Discoverpage.jsx:182-200`; `Backend/discover.js:203-320, 499-523` |

Finally, the UI is visually clean but still too monolithic and feed-heavy in the wrong way. The page is a mostly single-column stream inside `max-w-3xl`, with no project-side utilities such as active discussions, recommended makers, trending tags, saved posts, or “launches this week.” Code reference: `Frontend/Discoverpage.jsx:517-727`. Since your goal is for Discover to be useful but not the main feature, this is an opportunity: instead of trying to increase endless scrolling, you should increase **contextual utility** per screen.

## What strong benchmarks do differently

LinkedIn’s feed works because it layers creation, ranking, control, and analytics together. LinkedIn supports multiple content types such as text posts, photos, videos, documents, articles, events, and polls, and gives creators post analytics including discovery, in-network versus out-of-network reach, social engagement, link engagement, and viewer demographics.  It also supports following recommended sources, saving content, controlling who can comment, sorting comments by relevance versus recency, and @mentions that generate notifications.  Most importantly, LinkedIn’s feed is explicitly personalized around interests, activity, and professional relevance, and LinkedIn says it is reducing engagement bait and automated comments while improving relevance for new members through an interest picker.  The lesson for ProjectFolio is not “copy all LinkedIn formats.” The lesson is that feed usefulness comes from strong controls and relevance, not just posting.

Peerlist is the strongest direct inspiration for ProjectFolio because it is builder-first rather than generalist. Peerlist Scroll is a “context feed” with mandatory contexts such as `#show`, `#ask`, `#book`, `#hiring`, `#open_for`, and `#event`, specifically so the feed can be sorted and so posts remain high-signal.  Peerlist Launchpad is a structured launch surface: projects need a name, tagline, URL, images, tags, description, and category, and Launchpad is positioned as a way to get feedback, exposure, and early users.  Peerlist also supports third-party embeds in profiles, pages, and posts, which is directly relevant for code repos, demos, videos, and design previews.  The key lesson is that builder communities benefit when posting is constrained by context and supported with rich objects.

Product Hunt is a useful benchmark for launch moments and maker-to-community feedback loops. Product Hunt’s launch guide treats a product as a structured entity with URL, name, tagline, and supporting assets, and the homepage foregrounds ranking, category labels, vote counts, and discussion counts.  Product Hunt also emphasizes that comments are a core feedback channel, not a nice-to-have; its launch guide says the visible maker “first comment” matters a lot, and reports that 70% of products that achieved Product of the Day, Week, or Month included a first comment by the maker.  For ProjectFolio, that suggests a dedicated “launch update” post type with a maker note, clear CTA buttons, and comment prompts.

GitHub Discussions is the best benchmark for the *discussion* side of your vision. GitHub Discussions supports categories with explicit formats such as open-ended discussion, announcement, question-and-answer, and polls; it also supports threaded replies, reactions, upvotes, accepted answers, and moderation actions such as locking discussions or deleting disruptive content.  This is especially relevant because ProjectFolio is centered on projects. Builders often need a place to ask a specific question, collect feedback, and later mark the best answer or summarize the outcome. A flat comment list is not enough for that use case.

Wellfound is less useful as a feed benchmark and more useful as a discoverability benchmark. Official Wellfound materials focus on public profiles, recruiter discovery, featured profile exposure, and employer branding.  My inference is that ProjectFolio should treat Wellfound as proof that professional users value **presented credibility and talent discoverability**, while relying on LinkedIn, Peerlist, Product Hunt, and GitHub Discussions for the actual feed and discussion mechanics. 

## Product direction for ProjectFolio Discover

ProjectFolio Discover should become a **project-sharing and discussion layer**, not a generic social feed. The fastest way to get there is to make a post feel like a lightweight wrapper around a project action. In practice, most posts should belong to one of a small set of contexts:

- **Project update** for progress, milestones, revisions, and demos.
- **Feedback request** for targeted critique.
- **Question** for blockers, technical decisions, architecture tradeoffs, and UX uncertainty.
- **Launch** for “I shipped this.”
- **Resource** for sharing an article, repo, technique, or inspiration relevant to building.
- **Open to collaborate** for teammates, testers, mentors, or advisors.

That direction is strongly supported by Peerlist’s mandatory context model, Product Hunt’s structured launches, and GitHub Discussions’ category-specific formats. 

The design principle should be: **every post should either move a project forward or help someone else move theirs forward**. That sounds simple, but it is the core product filter that will stop Discover from turning into a low-signal general social area. It also matches LinkedIn’s stated effort to reduce generic content and engagement bait while improving relevance and authenticity. 

A second design principle is that Discover should feel like a **secondary but high-utility layer**. That means the main ProjectFolio value still lives in portfolios and projects, while Discover becomes the place to:
1. notice relevant builders and work,
2. ask or answer questions,
3. launch updates,
4. generate feedback loops,
5. convert attention into profile visits, follows, saves, or project opens.

This also aligns with Wellfound’s discoverability focus and LinkedIn’s analytics and follow systems. 

## Step-by-step implementation plan

### Phase structure

Below is the implementation sequence I would recommend. The order matters because it minimizes rework and lets you improve usefulness quickly before building heavier ranking or moderation systems.

**Step 1: Fix the correctness issues and add instrumentation**

Start with the two current data-contract bugs. Change the search frontend to read `searchResults.portfolios` instead of `searchResults.people`, or rename the backend field for compatibility. Also align the makers API and frontend on one field name for follow state, preferably `followed_by_viewer`. Code references: `Backend/discover.js:324-349, 413-442`; `Frontend/Discoverpage.jsx:324-327, 529-541`.

At the same time, add event instrumentation for:
- feed impression,
- post card impression,
- post click,
- project click from post,
- open comments,
- comment created,
- like toggled,
- follow from discover,
- save post,
- share/copy link,
- open create composer,
- publish success,
- dismiss composer.

You already have analytics infrastructure and background jobs for portfolio analytics, so extend the analytics model rather than inventing a separate one. Code references: `Backend/jobs/processors.js:10-63`; `Backend/migrations/001_scalability_schema.sql:98-165`. This unlocks later ranking work and creator analytics.

**Step 2: Replace the generic composer with a structured project composer**

This is the single highest-leverage product change.

Create a new post schema with:
- `post_type` enum,
- `context` enum or join table,
- `project_id` still optional but strongly encouraged for most types,
- `media_ids` array or `post_media` join table,
- `link_url` and preview metadata,
- `looking_for` array for feedback/collab asks,
- `allow_comments`,
- `comment_visibility`,
- `draft_status`,
- `published_at`,
- `edited_at`.

Recommended post types:
- `update`
- `feedback_request`
- `question`
- `launch`
- `resource`
- `open_to_collab`

For each type, the composer should change prompts and required fields:

- **Update** → title, short body, attach project, optional media
- **Feedback request** → title, specific question, attach project, choose feedback areas like UX, architecture, copy, onboarding, performance
- **Question** → title, body, tags, optionally attach project or code snippet
- **Launch** → project required, tagline pulled from project, primary CTA buttons to demo/repo/profile, open comments by default
- **Resource** → URL required, optional note, preview card
- **Open to collaborate** → specify role needed, timeline, stage, skills sought

This is where Peerlist’s mandatory context system is most instructive, and Product Hunt’s launch checklists help justify stronger structure around launch-style posts. 

Technically, you can implement this without a major frontend dependency change because the app already includes Tiptap and Dropzone and the backend already has Cloudinary upload flows. Code references: `Frontend/package.json`; `Backend/media.js:36-107`.

**Suggested database additions**

Create or extend these tables:

```sql
ALTER TABLE discover_posts
  ADD COLUMN post_type VARCHAR(40) NOT NULL DEFAULT 'update',
  ADD COLUMN context VARCHAR(40),
  ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'public',
  ADD COLUMN allow_comments BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'published',
  ADD COLUMN external_url TEXT,
  ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN edited_at TIMESTAMPTZ,
  ADD COLUMN published_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE post_media (
  post_id UUID NOT NULL REFERENCES discover_posts(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, media_id)
);

CREATE TABLE post_saves (
  post_id UUID NOT NULL REFERENCES discover_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE post_mentions (
  post_id UUID NOT NULL REFERENCES discover_posts(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, mentioned_user_id)
);
```

Also add a preview-generation job for external URLs so posts can render GitHub repo cards, live-demo cards, YouTube previews, or blog previews. Peerlist explicitly supports third-party embeds across posts and pages, which is a good project-sharing benchmark here. 

**Step 3: Upgrade the post card into a project object, not a plain text card**

Your current post card is clean, but it does not create enough reasons to click, save, or respond. Code reference: `Frontend/Discoverpage.jsx:131-200`.

Redesign the post card based on post type:

- **Launch card**
  - hero image or media carousel
  - project title and tagline
  - maker “why this exists” note
  - CTA buttons: View project, Live demo, GitHub
  - secondary metrics: saves, follows generated, comments

- **Feedback request card**
  - clear “looking for feedback on” badge set
  - one-line ask at top
  - preview of one or two best comments
  - “mark helpful” / “accepted answer” option

- **Question card**
  - Q&A badge
  - accepted answer highlight
  - answered/unanswered state
  - sort answers by helpful vs recent

- **Update card**
  - before/after media if available
  - changelog-like summary
  - project progress/status badge

- **Resource card**
  - external preview
  - reason for sharing
  - tags / topic chips

Action row should expand from like/comment to:
- like or upvote,
- comment,
- save,
- share/copy link,
- follow author,
- overflow menu for hide, mute, report, copy link, turn off comments if owner.

LinkedIn’s save controls, comment controls, and post analytics demonstrate the utility of creator and viewer controls; GitHub Discussions demonstrates the power of answer states and upvotes; Product Hunt demonstrates the importance of launch context and visible discussion. 

**Step 4: Rebuild comments into a real discussion system**

This is the second highest-leverage change after the composer.

Upgrade comments to support:
- threaded replies,
- sorting by `most_helpful` and `most_recent`,
- comment upvotes or “helpful” reactions,
- accepted answer for `question` and `feedback_request` posts,
- mentions,
- media-in-comment support later if needed,
- comment collapse for long threads,
- moderation actions on each comment.

GitHub Discussions is the cleanest model for this: threaded replies, reactions, upvotes, accepted answers, and category-specific behaviors.  LinkedIn also shows that comment sorting and mentions are table stakes on modern professional feeds. 

Recommended schema additions:

```sql
ALTER TABLE post_comments
  ADD COLUMN parent_comment_id UUID REFERENCES post_comments(id) ON DELETE CASCADE,
  ADD COLUMN edited_at TIMESTAMPTZ,
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN is_answer BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE comment_votes (
  comment_id UUID NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value SMALLINT NOT NULL CHECK (value IN (1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);
```

API additions:
- `POST /discover/posts/:id/comments`
- `POST /discover/comments/:id/replies`
- `POST /discover/comments/:id/vote`
- `DELETE /discover/comments/:id/vote`
- `POST /discover/posts/:postId/answer/:commentId`
- `PATCH /discover/comments/:id`
- `POST /discover/comments/:id/report`

On the frontend, move from a hidden inline comment block to either:
- an expandable drawer, or
- an inline preview + “Open discussion” route.

That will make discussion feel like a first-class object, not a hidden appendix.

**Step 5: Improve ranking and discovery**

Once your objects and events are better, ranking starts to matter.

Add feed modes:
- **For you**
- **Following**
- **Latest**
- **Launches**
- **Questions**
- **Feedback**
- **Saved**

Keep **Trending** if you want, but make it meaningful.

Recommended initial scoring formula for `for_you`:
- follow proximity,
- skill/category match,
- recent engagement velocity,
- recency decay,
- project quality/completeness,
- post-type boost based on viewer behavior,
- negative feedback penalty for hides/reports/skips,
- diversity penalty to avoid too many posts from one author consecutively.

For the first version, you do **not** need ML. A deterministic ranker with event features is enough. LinkedIn’s official guidance makes clear that feed usefulness comes from interest-based relevance, not only absolute popularity, and Peerlist’s context model reinforces that users want to sort by content intent. 

A practical first scoring formula could look like this:

```text
score =
  recency_decay_hours * 0.30 +
  follow_affinity * 0.20 +
  topic_match * 0.20 +
  engagement_velocity * 0.15 +
  project_quality * 0.10 +
  discussion_quality * 0.05
```

Where:
- `follow_affinity` = followed author, mutual follows, prior engages
- `topic_match` = overlap between viewer skills/interests and project stack/category/context
- `engagement_velocity` = recent saves + comments + project clicks, not just likes
- `project_quality` = cover image, tagline, links present, project completeness
- `discussion_quality` = depth of comments, helpful votes, accepted answer, low abuse score

Also add a cold-start interest picker on first Discover visit. LinkedIn explicitly says it is testing an interest picker for new members so they can see relevant content immediately.  For ProjectFolio, interests can be driven by:
- project categories,
- technologies,
- open-source / research / design / robotics / data science,
- goals such as “looking for collaborators,” “want to give feedback,” or “launching soon.”

**Step 6: Add secondary utility surfaces so Discover feels useful without becoming “the main thing”**

Because you want Discover to be useful but not dominant, do not put all value into the infinite feed. Add compact side surfaces.

On desktop, move to a 3-column layout:
- left rail for filters and navigation,
- center column for feed,
- right rail for utilities.

Right rail ideas:
- Recommended makers to follow
- Active discussions in your stacks
- Launches this week
- Saved posts
- Trending tags/contexts
- Recently updated projects from followed makers

This is where LinkedIn’s feed preferences and recommended follows, Peerlist’s context organization, and Product Hunt’s launch surfaces are especially instructive. 

Also add:
- better empty states,
- “Start with a template” composer prompts,
- “What happened after feedback?” recap prompts,
- lightweight daily or weekly digest email notifications later.

**Stylistic changes that should ship with the redesign**

The visual language should move a little away from “cute feed” and closer to “professional maker workspace.” That means:
- replace emoji-heavy primary nav labels with a consistent icon set and keep emoji only where they are tied to a category or post context,
- make project screenshots, cover images, and stack chips do more of the visual work,
- use higher contrast author/meta lines and more restrained gray borders so cards feel less toy-like,
- introduce clearer card hierarchy with: author row → context badge → project object → body → actions,
- show one or two context badges at the top-left of the card for immediate scanability,
- use comments preview modules rather than hiding all discussion behind a collapsed state,
- reserve accent colors for CTAs, selected filters, accepted answers, and launch badges,
- add “quality” cues such as verified profile, mutual follow, project completeness, and recent update badges.

Peerlist’s “show and tell” positioning, Product Hunt’s structured launch cards, and Wellfound’s brand-forward profile presentation all point in the same direction: strong reputation surfaces and strong objects make professional feeds feel more credible. 

**Step 7: Build trust, moderation, and anti-gaming controls early**

As the feed improves, abuse and low-signal content will rise. LinkedIn publicly says it is acting against automated comments, inauthentic engagement, recycled content, and engagement bait.  Peerlist’s guidelines explicitly discourage asking for upvotes and emphasize authentic engagement, accurate project info, and respectful behavior.  GitHub Discussions provides clear moderation and locking tools. 

ProjectFolio should add:
- report post/comment,
- mute user,
- hide post,
- block user,
- lock comments,
- owner-controlled comment settings,
- soft delete with audit log,
- spam scoring,
- duplicate-link detection,
- link-only suppression,
- trust-based throttles for new accounts,
- manual moderation queue,
- rate-limited mentions.

You already have quota middleware, which is good. Code reference: `Backend/discover.js:204, 270, 286, 295, 309, 500, 513`. Extend that system with trust levels instead of only fixed ceilings.

**Step 8: Ship creator analytics and feedback loops**

If ProjectFolio wants better content, creators need feedback on what works.

Add a post analytics page with:
- impressions,
- unique viewers,
- profile clicks,
- project clicks,
- saves,
- comments,
- follows generated,
- in-network vs out-of-network discovery,
- top viewer tags/stacks,
- bookmark rate,
- conversion to project open.

LinkedIn already treats per-post analytics as a core creator tool and surfaces discovery and audience breakdowns.  Product Hunt also implicitly treats discussion response as a post-launch workflow.  For ProjectFolio, this feature has two benefits: it teaches creators what useful posts look like, and it gives you first-party signals for ranking.

## Success metrics and rollout gates

The north star for Discover should not be raw session length or total likes. That will push the product toward generic social behavior. Your north star should be **qualified project interaction**:

> A qualified project interaction is a Discover session that leads to at least one of: project open, save, thoughtful comment, accepted answer, follow, or return visit to the same project/post.

That north star better reflects your actual product goal: make Discover a useful project-sharing and discussion layer.

Recommended metric stack:

- **North-star**
  - qualified project interactions per weekly active discover user

- **Creator quality**
  - median project clicks per post
  - median saves per post
  - % of posts with at least one thoughtful comment
  - % of `question` posts with accepted answer
  - % of `feedback_request` posts that receive response within 48 hours

- **Viewer quality**
  - save rate
  - follow-from-post rate
  - click-through to project page
  - hide/report rate
  - repeat discover visits

- **Marketplace health**
  - posts per active creator
  - commenters per active creator
  - ratio of launch/update/question/feedback content
  - distribution of impressions across authors
  - new creator retention after first post

- **Guardrails**
  - spam report rate
  - posts hidden by moderation
  - likes-to-comments skew by cohort
  - % of low-information text-only posts
  - median time to first response on questions

Recommended rollout sequence:

1. **Foundation release**
   - fix current bugs
   - add instrumentation
   - add save/share/report
   - launch creator analytics v1

2. **Structured composer release**
   - add post types
   - add media and link previews
   - add richer post cards
   - add templates and prompts

3. **Discussion release**
   - threaded replies
   - helpful votes
   - accepted answers
   - question/feed filters

4. **Ranking release**
   - interest picker
   - for-you feed
   - recommended makers
   - diversity controls

5. **Launch ecosystem release**
   - dedicated launch post type
   - stronger launch pages/cards
   - launch digest and weekly showcases

At each release, compare cohorts against the prior baseline on:
- project click-through,
- quality comments per post,
- hide/report rate,
- creator repeat posting rate,
- viewer return rate.

If a change increases likes but decreases project clicks or thoughtful comments, treat it as a regression.

## Final recommendation

If you only do three things in the next cycle, do these:

1. **Fix the current contract bugs and add analytics instrumentation.**
2. **Replace the generic composer with structured project-first post types.**
3. **Turn comments into real project discussions with answers, replies, and helpful sorting.**

Those three changes will move Discover from “basic social feed” to “useful project discussion layer” faster than any visual redesign alone.

After that, invest in ranking and creator analytics. The winning shape for ProjectFolio is not a big-content machine. It is a small, high-signal professional layer where builders share work, get feedback, and discover serious peers. That strategy is much closer to the strongest parts of Peerlist, Product Hunt, GitHub Discussions, and LinkedIn than the current plain-post implementation.
