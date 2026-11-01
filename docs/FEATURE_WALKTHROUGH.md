# ProjectFolio feature walkthrough

ProjectFolio helps students and early-career technical candidates turn project work into a portfolio, share it with other builders, and prepare material for opportunities and applications.

This draft follows the user interface and backend code at commit `aae2910c29706a78e8d9e254eda33e2463ecdeb5`. It describes features present in the source, not a completed live demonstration. The project has been tested locally by its author and friends and is not publicly deployed. External-service configuration affects which features can be exercised.

## The main user journey

A typical session starts with creating an account and completing a profile. The user then creates or imports a project, documents it with content blocks, and publishes it. Portfolio Studio controls how that work is presented. From there, the user can share a public link, collaborate with a team, discuss work on Discover, assess opportunities, prepare application materials, and review analytics.

The signed-in sidebar contains Projects, Portfolio, Media Library, Analytics, Opportunities, Advisor, Integrate & Apply, Teams, and Discover. Profile and account settings are available through the account area. A notification bell, light/dark mode control, public-portfolio link, and sign-out control are also available. The desktop sidebar can collapse, and smaller screens use a navigation drawer.

## 1. Create an account and choose a starting direction

Start at the landing page and open registration. The authentication screens support email/password registration and login. Social sign-in options depend on the providers enabled in the connected Supabase project. Email confirmation, password recovery, and password reset use the configured Supabase flows.

For a new user, onboarding offers three starting identities:

- **Engineer:** technical projects and systems, with a classic project grid.
- **Designer:** visual and creative work, with a magazine-style starting layout.
- **Researcher:** academic and scientific work, with a wider presentation.

The user can also select goals such as finding an internship, getting a job, applying for research, finding freelance clients, or showcasing work. These choices establish initial preferences; they do not prevent later customization.

**Walkthrough action:** create a development account, complete any required email confirmation, and choose Engineer as the starting direction.

## 2. Build the profile and experience record

Open **Settings → Profile**. The profile form supports a photo, full name, username, headline, biography, location, public contact email, phone number, skills, and website/LinkedIn/GitHub links. The username forms part of the portfolio address.

Below the main form, the experience editor supports employment, education, and certification entries. These are saved per entry independently of the main profile form. This structured background is available to application-related features; it should not be confused with the separate presentation-oriented Education & Credentials controls in Portfolio Studio.

The page also shows private Discover activity totals for posts, makers followed, comments, and saves.

**Walkthrough action:** add a short headline and bio, several skills, a GitHub link, and one experience entry. Save the profile form and the experience entry separately.

## 3. Use Projects as the work dashboard

The **Projects** page lists owned projects separately from projects the user is collaborating on. When projects exist, summary cards show total, published, draft, and featured counts.

Users can create a new project, import from GitHub, open a project for editing, publish a draft, return a published project to draft, or delete an owned project after confirmation. Project cards expose project details and completion cues. Smart Highlights suggest ways to improve the evidence in a project, such as adding a cover image, a tagline, technologies, dates, or a repository/demo link.

Portfolio preview offers **Recruiter**, **Mobile**, and **Quick skim** views. Recruiter and mobile views frame the portfolio, while Quick skim gives a compact overview. These are presentation previews, not actual feedback from a recruiter or independent evaluations of the portfolio.

**Walkthrough action:** inspect the empty state, create a project, then return to the dashboard to show how the project counts and completion guidance change.

## 4. Create and document a project

Choose **New Project**. The editor has **Content** and **Settings** tabs.

### Project details

Provide a title and one-line tagline. Settings support a cover image, project type, technology/tool tags, start and end dates, GitHub URL, live-demo/project URL, short description, and featured status.

Project types include Research, Engineering Design, Software, Robotics, Simulation / CFD, Data Science, Hardware, and Other.

### Content blocks

Build a project story with the block editor:

| Block | Intended use |
| --- | --- |
| Text | Formatted explanations, lists, quotations, and links |
| Heading | Section hierarchy |
| Divider | Separate parts of the story |
| Callout | A note, result, warning, or insight |
| Image | An uploaded or linked image with supporting details |
| Image Gallery | Several images presented together |
| Video | Supported uploaded or externally hosted video |
| File Attachment | Reports, PDFs, engineering files, and other supported documents |
| Embed | Allowed external embedded content |
| Code Block | A code excerpt |
| Metrics / Stats | Quantified project results |
| Table | Structured data or comparisons |
| Timeline | Milestones and phases |

Blocks can be rearranged. Undo and redo are provided, including keyboard shortcuts. The Media control opens the editor's media sidebar so users can reuse uploaded assets and copy their URLs.

Existing projects autosave block edits after a short delay and display saving, saved, or error status. A new project must first be created, and metadata changes still require attention to the explicit save controls. Do not describe the editor as automatically saving every possible change.

Use **Save draft** to retain work without publishing and **Publish** when ready. The dashboard also exposes the published/draft status toggle. A published project gets a public project page when the portfolio's visibility allows it.

**Walkthrough action:** create sections for Problem, Approach, and Results; add a screenshot, a code block, and a metrics block; save the draft and then publish it.

## 5. Import a project from GitHub

From Projects, select **Import from GitHub** and paste a public repository URL. The import workflow retrieves repository information and the README and creates an editable draft with title, tags, links, and imported content.

The interface waits for the background import result, then opens the created project. The user should review the imported material, add personal contribution and outcome details, and decide what to publish. This is a portfolio-content import, not a deployment of the repository or an audit of its correctness. The exposed import flow is designed for public repositories.

**Walkthrough action:** import a public sample repository and show the resulting draft before publishing anything.

## 6. Manage reusable assets in Media Library

The **Media Library** supports uploading multiple files, browsing the collection, filtering All files / Images / Videos / Documents, previewing supported assets, copying file URLs, and deleting an asset after confirmation. Uploads depend on Cloudinary configuration.

Assets can support project documentation and Discover posts. The Discover composer selects from existing media; upload new assets in the Media Library first. Public access to a portfolio and access to an uploaded asset are different concerns, so use media appropriate for sharing.

**Walkthrough action:** upload an image and a PDF, filter the collection, preview them where supported, and copy an asset URL for reuse in a project.

## 7. Design the portfolio manually

Open **Portfolio** to enter Portfolio Studio. The workspace has **Chat** and **Controls** modes, alongside a live-site preview with Desktop and Mobile sizes, Refresh, and Open site.

Controls organize the manual settings into **Appearance**, **Sections**, **SEO**, and **Custom code**.

### Appearance

Choose Clean, Bold, or Minimal themes, select an accent color, and choose a layout:

- **Classic:** profile header and project grid.
- **Sidebar:** profile information beside the project area.
- **Magazine:** a prominent featured project and supporting cards.
- **Minimal:** a compact text-oriented list.
- **Full Width:** wide project cards.

The visibility control governs whether the portfolio is public. A private portfolio can still be viewed by its owner in the studio preview.

### Sections and credentials

Reorder available sections, enable optional sections, and choose whether to show skills, project dates, and project types. Section settings include spacing, backgrounds, project cards per row, card style, and card spacing. AI-generated sections can appear in the section controls when present.

Education & Credentials accepts degrees, certifications, awards, and courses, with institution, field, notes/honors, dates, and an optional credential URL. These control the portfolio's credential presentation.

### SEO and sharing

Set a page title and meta description and copy the portfolio URL. These fields describe the intended search/share metadata; changing them does not guarantee search indexing or ranking.

### Custom code

The interface exposes scoped CSS plus a custom-site editor with `index.html`, `styles.css`, and `script.js`, including starter generation, validation feedback, save, and enable controls. Custom-site publishing uses a separately configured sandbox origin in production. It is not an unrestricted browser scripting environment.

The studio tracks manual and AI customization layers. Manual settings generally take precedence unless the user explicitly asks for a redesign. Controls include ways to clear manual overrides.

**Walkthrough action:** change the theme and layout, reorder the optional sections, add a credential, save, and compare desktop and mobile previews.

## 8. Use the Site Agent with review and recovery

In **Portfolio → Chat**, describe a desired change or redesign. Available agent modes and model choices depend on the backend configuration; disabled models may be shown as locked.

The agent workflow can produce a proposed bundle rather than applying an unreviewed result immediately. Depending on the response, the user may first be asked to clarify goals or preferences.

The review interface can show the design brief, site plan, proposed settings and section changes, code comparisons, warnings, browser-verification results, and a visual preview. **Apply bundle** accepts the proposal; **Discard** rejects it. A failed browser-verification state can block application.

The studio's main live-site preview shows the current site until the proposal is applied; a proposal's review preview is a separate representation. Browser checks can warn or skip when prerequisites are unavailable. A displayed check is evidence for its stated scope, not a guarantee that every site behavior is correct.

Applied bundles have history and recovery controls. Where the stored bundle supports them, the user can remove generated sections or code, remove AI visuals, verify the live result, or revert to a saved snapshot. Older bundles may have fewer removal options. A full snapshot revert can restore broader prior state, so its confirmation should be read carefully.

The agent workspace also supports prior chats and saved memory/preferences. Deleting a chat or memory does not automatically undo website changes; use the removal or revert controls for that.

**Walkthrough action:** request a small visual change, inspect the proposal and warnings, apply it, then demonstrate the available recovery option. Use a development portfolio for the demonstration.

## 9. Review the public portfolio and project pages

The public portfolio route is `/<username>`. It presents the configured profile, published projects, and enabled contact, credential, and endorsement sections. Standard portfolio views support project filtering and alternate viewer layouts where the active design exposes them. Signed-in visitors can follow the maker.

Each published project has a detail route at `/<username>/<projectSlug>`. The page displays its title, tagline, cover, dates, technologies, collaborator information, repository/demo links, and content blocks. A return link leads back to the portfolio or originating team view.

**Walkthrough action:** open the portfolio in a separate visitor session, filter the projects, open one project, follow its GitHub/demo link, and return to the portfolio. Use the visitor session to confirm the intended public presentation instead of relying only on the signed-in owner's preview.

## 10. Request and moderate endorsements

Portfolio Controls includes an **Endorsements** area. Generate a request link, optionally associate it with one of your projects, and optionally send an email with a personal note when SMTP is configured.

The recipient opens `/endorse/<token>` and supplies a name, optional role/company, and an endorsement. The portfolio owner can approve, reject, or delete submissions. Approved endorsements can appear when the relevant portfolio section is enabled.

Owner approval is a publishing decision. It is not independent verification of the submitter's identity or claims.

**Walkthrough action:** create a request link, submit a clearly labeled demonstration endorsement, and show the owner approval step before displaying it publicly.

## 11. Collaborate on projects and team portfolios

### Individual project collaboration

An owned, saved project has a Collaborators panel. The owner can invite another account by username or generate an invitation link. The UI describes project invitation links as expiring after seven days. Recipients sign in and accept through the join flow.

Accepted collaborators can access and edit the shared project. The dashboard lists these under **Collaborating on**, while owner-only actions such as project deletion remain separate. The code checks content versions during block synchronization; this is shared editing with conflict checks, not a demonstrated live multiplayer editor.

### Teams

Use **Teams** to create an Organization, Club, Research Group, Startup, Class / Course, or Other team. Provide its name, description, and optional website.

A team workspace includes Projects, Members, and Invite tabs, with Analytics and Settings available to administrators. Authorized users can add eligible projects, remove team project associations, send username invitations, generate invite links, and manage membership. Administrator controls support role changes and removal of members, subject to ownership protections.

Team settings cover identity, portfolio visibility and presentation, themes, layouts, accent color, section order, section details, and search/share metadata. A team public page lives at `/team/<slug>` and presents the configured team, its members, and eligible published work. Team analytics summarizes views and traffic for authorized administrators.

**Walkthrough action:** create a demonstration team, invite a second development account, add a published project, and show its team page and administrator controls.

## 12. Share and discuss work on Discover

**Discover** is available at `/discover` and has **Feed** and **Makers** views. Visitors can browse public content; contributing and following require sign-in.

Feed modes are **For you**, **Latest**, and **Trending**. Filters and search help users find posts, makers, technologies, project categories, and contexts. Signed-in users can save interests such as contexts, technologies, and goals to inform recommendations.

### Compose a post

The composer supports Update, Feedback, Question, Launch, Resource, and Collaborate post types. Add the relevant title/body, context, technology tags, a project, an external resource link, or existing media as appropriate.

Choose public-feed or followers-only visibility, configure whether comments are allowed and who can comment, and save a draft or publish. Existing posts can be edited or deleted by the author.

### Interact with a post

Users can like, comment, reply, mark a comment helpful, save a post, share its link, follow its author, hide a post, or submit a report. Authors of Question and Feedback posts can mark an eligible top-level comment as an accepted answer. Comment sorting is available.

Post authors can inspect an analytics panel with qualified interactions, project clicks, shares, and saves. Some additional moderation or session-management operations exist in backend routes without a matching prominent control in the current interface; this walkthrough does not invent those controls.

**Walkthrough action:** publish a development update linked to a portfolio project, reply from another account, then demonstrate a feedback/question post with an accepted answer and its author analytics.

## 13. Assess opportunities against the portfolio

The **Opportunities** page contains **AI Portfolio Match** and **Opportunity Finder**.

Both tools require at least one owned project with a completeness score of 50 or higher. This score measures filled-in project evidence, not the real percentage of engineering work completed. Fields such as a cover, tagline, description, technologies, dates, and a repository/demo link contribute to it. The requirement is checked on the backend, not only in the interface.

### AI Portfolio Match

Paste a job, fellowship, or program URL and request an analysis. The results interface supports a compatibility score and rationale, strengths, gaps, missing evidence, prioritized action items, and project-by-project relevance ratings. Model/confidence information appears when returned.

### Opportunity Finder

Choose opportunity types: Internships, Fellowships, Competitions, Grants and scholarships, and Open source. The tool uses portfolio context to return top matches, additional suggestions, reasons, and next steps; result cards can be filtered by type.

These features depend on configured AI providers and reachable source pages. AI compatibility scores are guidance, not official eligibility decisions. Follow the original listing to confirm availability, deadlines, and requirements. The source does not establish an exhaustive, continuously verified live job database.

**Walkthrough action:** use a portfolio that passes the completion gate, analyze one known posting, and compare the suggested gaps with the evidence actually present in the project.

## 14. Build a learning plan with Advisor

**Advisor** turns portfolio context and a goal questionnaire into a saved roadmap. Select **Build standout projects**, **Develop new skills**, or **Land a position**; choose whether to strengthen the current level or advance to the next one; and optionally specify a focus area, target role, and timeframe.

Results can include a discipline/level analysis, strengths, gaps, recommended projects, skills to develop, resource/tutorial links, difficulty, estimated duration, and the existing work a suggestion builds upon. Suggestions may be curated or generated, and fallback information is shown when returned.

The roadmap presents steps with completion checkboxes and a progress indicator. Progress persists, and saved roadmaps can be reopened or deleted. Check linked resources before relying on them; generated recommendations and time estimates require judgment.

**Walkthrough action:** request a skills-focused roadmap, open a suggested resource, mark a step complete, leave the page, and reopen the saved roadmap to demonstrate persistence.

## 15. Share, export, and prepare applications

**Integrate & Apply** combines three tabs.

### Share & Export

Copy the portfolio URL, use the provided quick-share actions, download a portfolio PDF, or export portfolio data as JSON. PDF generation runs as a background job and depends on the configured browser/media delivery workflow. The JSON download is a data export even though the historical endpoint includes the word `zip`.

### API & Embed

View the public portfolio API information and copy an embeddable portfolio card. These are sharing/integration surfaces; they do not establish an approved connection to a third-party application platform.

### Application Helper

Choose one of the coded formatting profiles: Generic, LinkedIn, Indeed, Greenhouse, Lever, or Workday. Enter a job title and company, optionally paste a posting URL and use its information-extraction action, and add writer notes.

The generated package exposes a downloadable resume PDF, a cover letter to copy, a project summary and portfolio URL to copy, and platform-specific tips. The page also lists prepared application sessions and their preparation status.

This workflow prepares materials. It does not automatically complete external application forms or submit applications. Platform profiles are application defaults, not live verification of every employer's form. Review generated content and the destination's requirements before using the package. A prepared-session status is not evidence that an employer received an application.

**Walkthrough action:** generate a demonstration package for a known posting, inspect its source facts, download the resume, and copy the cover letter and project summary without submitting anything externally.

## 16. Review traffic and manage the account

**Analytics** provides 24-hour, 7-day, 30-day, 1-year, and all-time ranges. The interface shows views, unique-visitor estimates, average views per day, peak-day activity, a views-over-time chart, views by project, and traffic-source breakdowns when data is available. It also shows an all-time total alongside the selected period.

These are aggregate activity measures. They do not identify individual recruiters, prove who read a page, or establish hiring outcomes.

The notification bell lists events such as invitations and accepted collaborations. Users can open an item, mark notifications read, mark all read, or remove notifications.

Under **Settings → Account**, users can change their sign-in email, change their password through the configured Auth flow, toggle Smart Highlights, and sign out. Email changes may require confirmation. Public contact email in Profile is a separate field from the authentication email.

**Walkthrough action:** show an invitation notification and the analytics date filter, then distinguish the account email from the public contact email. Avoid changing real credentials during a presentation.

## Suggested demonstration sequence

For a concise recorded tour, use this order:

1. Show the Projects dashboard and explain the problem the app addresses.
2. Open a completed profile and one structured experience entry.
3. Create a project with text, image, code, and results blocks.
4. Show GitHub import creating an editable draft.
5. Publish the project and inspect its public detail page.
6. Change a layout in Portfolio Controls and compare mobile/desktop previews.
7. Ask the Site Agent for a small change; show review, apply, and recovery.
8. Show a project invitation or a team page using a second test account.
9. Publish a Discover update and demonstrate comments or an accepted answer.
10. Run Portfolio Match and explain one evidence gap.
11. Generate an Advisor roadmap and mark a step complete.
12. Prepare an application package and show exports, then finish on Analytics.

Prepare example assets and accounts beforehand. Use successful observed results in the final recording; if a configured service is unavailable, label that part as a code-supported feature rather than pretending it ran.

## Configuration and scope notes

| Area | What it depends on |
| --- | --- |
| Account and profile flows | Supabase Auth, correct redirect URLs and signing configuration, application migrations and triggers |
| Project and portfolio data | API and database connectivity |
| Uploads and some generated-file delivery | Cloudinary configuration |
| Queued jobs | Redis and worker in production; limited inline execution is available locally without Redis |
| AI editing, matching, suggestions, application writing | Enabled providers, credentials, quotas, and reachable source material |
| Browser verification and PDF rendering | Working browser dependencies and relevant service configuration |
| Email requests and outreach | SMTP; Auth email configuration is separate |
| Executable custom sites exposed publicly | Correctly configured sandbox origin and hosting |

Backend routes also expose individual-project JSON export and some regeneration/deletion operations beyond the controls currently shown in the corresponding pages. These are API capabilities, not additional buttons demonstrated by this walkthrough.

This document does not claim production deployment, live multiplayer editing, independent endorsement verification, automatic external application submission, guaranteed AI accuracy, measured user capacity, or completion of every feature in the historical export specification.

## Code reference map

The main sources inspected for this walkthrough are pinned to the reviewed commit:

- [Routes and navigation](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/main.jsx)
- [Dashboard](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/pages/DashboardPage.jsx)
- [Project editor](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/pages/ProjectEditorPage.jsx) and [block types](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/components/editor/BlockEditor.jsx)
- [Portfolio Studio](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/pages/PortfolioStudioPage.jsx), [manual controls](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/pages/PortfolioSettingsPage.jsx), and [agent review/recovery](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/components/site-agent/AgentWorkspace.jsx)
- [Discover](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/pages/DiscoverPage.jsx) and [post interactions](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/components/discover/DiscoverPostCard.jsx)
- [Teams](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/pages/TeamDetailPage.jsx)
- [Opportunity tools](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/pages/AIToolsPage.jsx) and [completeness gate](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/backend/utils/projectCompleteness.js)
- [Advisor](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/pages/AdvisorPage.jsx)
- [Integrate & Apply](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/pages/IntegrationsPage.jsx), [Application Helper](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/pages/ApplicationHelperPage.jsx), and [platform profiles](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/backend/applicationHelper/platforms.js)
- [Analytics](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/pages/AnalyticsPage.jsx), [profile](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/pages/ProfileSettingsPage.jsx), and [account](https://github.com/zayd-kemper/Projectfolio/blob/aae2910c29706a78e8d9e254eda33e2463ecdeb5/frontend/src/pages/AccountSettingsPage.jsx)
