# Design and implementation history

The files in `plans/` and `specs/` record the AI-assisted planning process. They are historical working documents, not installation instructions or current release checklists.

| Area | What is present in the current source | What this does not establish |
| --- | --- | --- |
| AI-tool completion gate | Completion scoring, route checks, and related tests | That every provider or live route has passed a new end-to-end run |
| Supabase Auth migration | Supabase clients, JWT verification, provisioning triggers, and migrations through 012 | That a particular live database has completed cutover, or that the proposed 013 cleanup exists |
| Caching hardening | Event retention, scoped invalidation, response headers, and route-level invalidation tests | Measured production capacity or completion of every historical task |

Unchecked boxes preserve the original task breakdown; they are not maintained as a live project board. Implementation exists for the areas above, but the original plans have not been audited task by task in this documentation update. Use source, current tests, and recorded deployment results to establish completion.

For operational instructions, use [setup](../SETUP_GUIDE.md) and [deployment](../../DEPLOYMENT.md).
