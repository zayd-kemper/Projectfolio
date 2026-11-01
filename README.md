# ProjectFolio

ProjectFolio helps engineering and science students document projects with supporting media, publish portfolio pages, and export their work for applications.

## Project status

This is a personal learning project, tested locally by the author and friends. It is not currently deployed publicly. Features in the source are at different stages of validation; planned work is identified separately in the documentation.

## AI-assisted development and my role

AI agents generated much of the implementation. I used the project to learn how to divide larger tasks among specialized subagents, specify requirements, review their combined work, and organize an iterative development workflow. The repository preserves implementation plans and design decisions from that process. AI assistance is not a claim that every feature has been independently verified or is production-ready.

## Implemented areas

- Project editing with text, code, and media blocks.
- Public portfolio, project, and team pages.
- Portfolio customization and an AI-assisted site editor.
- PDF and JSON export routes.
- A Discover feed, collaboration, and portfolio analytics.
- Application helpers, shareable links, and outreach templates.

Sharing/export features can support job applications. They do not imply an approved partnership or automatic submission integration with Zintellect or another platform.

## Architecture

| Component | Implementation |
| --- | --- |
| Frontend | React, Vite, Tailwind CSS, TipTap |
| API | Node.js and Express |
| Application data | PostgreSQL in the same Supabase project as Auth |
| Identity | Supabase Auth; API verifies access tokens through JWKS |
| Cache, quotas, rate limiting, jobs | Redis and BullMQ |
| Background processing | Separate worker process when Redis is enabled |
| Uploaded media | Cloudinary |

Redis is optional for a limited local setup and required in production. Authentication uses Supabase sessions; Redis does not store first-party login sessions.

## Run locally

Follow the [setup guide](docs/SETUP_GUIDE.md). It covers Supabase configuration, both environment files, database migrations, and starting the frontend and API. A plain PostgreSQL installation without Supabase Auth is not sufficient for the current schema.

From the repository root, install the locked dependencies:

```powershell
npm --prefix backend ci
npm --prefix frontend ci
```

After configuring the environment and Supabase project:

```powershell
Set-Location backend
npm run db:migrate
npm run dev
```

In another terminal opened at the repository root:

```powershell
Set-Location frontend
npm run dev
```

Open `http://localhost:3000`. Configure Redis and start `npm run worker` from `backend` when exercising queued jobs. Without Redis, new jobs run within the API process for local development.

## Checks

From the repository root:

```powershell
npm --prefix backend test
npm --prefix frontend test
npm --prefix frontend run build
```

Browser and live-service checks have additional prerequisites; see [verification](docs/SETUP_GUIDE.md#verification). No passing status or performance capacity is asserted here without a corresponding run.

## Known limitations

- There is no public deployment or verified production-capacity benchmark.
- The legacy test-portfolio seed script is not a supported Supabase signup workflow. Create test accounts through the application instead.
- Browser checks may skip when Chromium is unavailable; inspect the test summary.
- The richer portfolio export in `docs/PORTFOLIO_EXPORT_SPEC.md` is a design specification, not a promise that every specified capability is implemented.

## Documentation

- [Local setup and verification](docs/SETUP_GUIDE.md)
- [Deployment entry point](DEPLOYMENT.md)
- [Custom-site sandbox deployment](docs/CUSTOM_SITE_SANDBOX.md)
- [Scaling and operating notes](docs/SCALABILITY_DEPLOYMENT.md)
- [Product direction](PRODUCT.md)
- [Design system](docs/DESIGN.md)
- [Historical plans](docs/superpowers/README.md)
- [Historical research and reviews](docs/Legacy/README.md)


## Reviewer walkthrough
- [Feature Walkthrough](docs/FEATURE_WALKTHROUGH.md)

Alternatively the application can be run locally, users can create an account and test functionalities.


