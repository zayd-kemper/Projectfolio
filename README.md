# ProjectFolio

**A portfolio platform built for engineering and science students.**

Document your projects with rich media, share them with a link, and integrate directly with job application platforms like ORISE Zintellect.

---

## Quick start

```bash
# 1. Set up the backend
cd backend
npm install
cp .env.example .env        # Fill in your values
node config/migrate.js       # Create database tables
npm run dev                  # Start the API server

# 2. Set up the frontend (in a new terminal)
cd frontend
npm install
npm run dev                  # Start the React app
```

Then open `http://localhost:3000`

**See [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) for the full step-by-step guide.**

---

## Features

- **Block editor** — Text, images, videos, code, callouts, file attachments
- **Public portfolio URL** — `yoursite.com/your-username`
- **PDF & JSON export** — Attach to any application
- **Zintellect integration** — Pre-written outreach email + public API spec
- **View analytics** — See who's reading your portfolio
- **Media library** — Manage all uploaded files

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Database | PostgreSQL |
| Media | Cloudinary |
| Editor | TipTap |
| Auth | JWT |

## Project structure

```
projectfolio/
├── backend/          ← Node.js/Express API
├── frontend/         ← React app
└── docs/
    └── SETUP_GUIDE.md   ← Full setup instructions
```
