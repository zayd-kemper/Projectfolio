# ProjectFolio — Complete Setup & Implementation Guide

> Written for someone completely new to web development. Every step is explained.  
> Estimated setup time: **1–2 hours** for a local working version.

---

## Table of Contents

1. [What you're building](#what-youre-building)
2. [What you need to install first](#what-you-need-to-install-first)
3. [Step 1 — Set up the database (PostgreSQL)](#step-1--set-up-the-database)
4. [Step 2 — Set up Cloudinary (free image/video storage)](#step-2--set-up-cloudinary)
5. [Step 3 — Configure and run the backend](#step-3--configure-and-run-the-backend)
6. [Step 4 — Run the frontend](#step-4--run-the-frontend)
7. [Step 5 — Create your first portfolio](#step-5--create-your-first-portfolio)
8. [Step 6 — Integrate with Zintellect and other platforms](#step-6--integrate-with-job-platforms)
9. [Deploying to the internet (going live)](#deploying-to-the-internet)
10. [Troubleshooting common errors](#troubleshooting)
11. [File structure reference](#file-structure-reference)
12. [API reference](#api-reference)

---

## What you're building

ProjectFolio is a **full-stack web application** — a real product with:

- A **React frontend** (what users see in the browser)
- A **Node.js/Express backend** (the server that handles logins, saving data, etc.)
- A **PostgreSQL database** (stores users, projects, blocks)
- **Cloudinary** (stores uploaded images and videos)

When you run it locally, you'll have:
- Your app at `http://localhost:3000`
- Your API at `http://localhost:5000`
- Your portfolio at `http://localhost:3000/your-username`

---

## What you need to install first

### 1. Node.js
Node.js is the runtime that lets you run JavaScript on a server (not just in a browser).

1. Go to [nodejs.org](https://nodejs.org)
2. Download the **LTS version** (the one that says "Recommended For Most Users")
3. Run the installer — click through all the defaults
4. Verify it worked: open a Terminal (Mac) or Command Prompt (Windows) and type:
   ```
   node --version
   ```
   You should see something like `v20.10.0`. If you do, it worked.

### 2. PostgreSQL (your database)
PostgreSQL is a free, powerful database system.

**On Mac:**
1. Go to [postgresapp.com](https://postgresapp.com)
2. Download and install Postgres.app
3. Open it — a small elephant icon appears in your menu bar
4. Click "Initialize" to create your first database cluster
5. Click "Start" to start the database server

**On Windows:**
1. Go to [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)
2. Download the installer from EnterpriseDB
3. Run it — during setup, **write down the password you set** for the `postgres` user. You'll need this.
4. Keep the default port (5432)

**On Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### 3. Git (optional but recommended)
Git lets you save versions of your code.
- Mac: Run `xcode-select --install` in Terminal
- Windows: Download from [git-scm.com](https://git-scm.com)

---

## Step 1 — Set up the database

### Open your database terminal

**Mac (Postgres.app):**
Click the elephant icon in your menu bar → Open psql

**Windows:**
Search for "pgAdmin" in your Start menu, or open "SQL Shell (psql)"

**Linux:**
```bash
sudo -u postgres psql
```

### Create the database

Type these commands in the psql prompt (press Enter after each):

```sql
CREATE DATABASE projectfolio;
CREATE USER projectfolio_user WITH PASSWORD 'choose_a_password_here';
GRANT ALL PRIVILEGES ON DATABASE projectfolio TO projectfolio_user;
\q
```

> **Write down** the password you chose. You'll need it in Step 3.

---

## Step 2 — Set up Cloudinary

Cloudinary is where your uploaded images and videos are stored. It's free up to 25GB.

1. Go to [cloudinary.com](https://cloudinary.com) and click **Sign Up Free**
2. Fill in the form (use your personal email)
3. After logging in, go to your **Dashboard**
4. You'll see three values — write these down:
   - **Cloud Name** (looks like: `dxy1abcde`)
   - **API Key** (a long number like: `123456789012345`)
   - **API Secret** (a long string like: `abcDEFghiJKLmno123`)

You'll paste these into your `.env` file in Step 3.

---

## Step 3 — Configure and run the backend

### Open a Terminal / Command Prompt

**Mac:** Press `Cmd + Space`, type "Terminal", press Enter  
**Windows:** Press `Windows + R`, type `cmd`, press Enter  
**VS Code (recommended):** Open VS Code → Terminal → New Terminal

### Navigate to the backend folder

```bash
cd path/to/projectfolio/backend
```

> Replace `path/to/projectfolio` with the actual path to where your files are.  
> Example on Mac: `cd ~/Downloads/projectfolio/backend`  
> Example on Windows: `cd C:\Users\YourName\Downloads\projectfolio\backend`

### Install dependencies

```bash
npm install
```

This downloads all the code libraries the backend needs. It may take 1–2 minutes. You'll see a progress bar. When it finishes you'll see your command prompt again.

### Create your environment file

The `.env` file stores secret settings (passwords, API keys). It is **never shared** or uploaded to GitHub.

```bash
# Mac/Linux:
cp .env.example .env

# Windows:
copy .env.example .env
```

Now open the `.env` file in a text editor (Notepad on Windows, TextEdit on Mac, or VS Code):

```bash
# If you have VS Code:
code .env
```

Fill in each value:

```env
PORT=5000
NODE_ENV=development

# Paste your PostgreSQL details here:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=projectfolio
DB_USER=projectfolio_user
DB_PASSWORD=choose_a_password_here   ← the password you made in Step 1

# Make this a long random string (just mash your keyboard):
JWT_SECRET=xJ8kP2mQnR5tVwYzA9bCdEfGhIjKlMnOpQrStUvWx

# Paste your Cloudinary values from Step 2:
CLOUDINARY_CLOUD_NAME=dxy1abcde
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=abcDEFghiJKLmno123

# Where your frontend runs:
FRONTEND_URL=http://localhost:3000
APP_URL=http://localhost:5000
```

> **AI provider setup (optional for Site Agent):** Groq is the default provider. OpenRouter is optional and should only be enabled when you want to test the Qwen, GPT-OSS, Nemotron, Laguna, or Nex model choices.
>
> ```env
> # Groq
> GROQ_API_KEY=your_groq_api_key
> GROQ_PROVIDER_TIMEOUT_MS=75000
>
> # NVIDIA GPT-OSS
> ENABLE_NVIDIA_MODELS=false
> NVIDIA_API_KEY=your_nvidia_api_key
> NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
> NVIDIA_PROVIDER_TIMEOUT_MS=150000
> NVIDIA_GPT_OSS_TIMEOUT_MS=150000
> NVIDIA_GPT_OSS_20B_MODEL=openai/gpt-oss-20b
> NVIDIA_GPT_OSS_JSON_MODE=false
>
> # OpenRouter
> ENABLE_OPENROUTER_MODELS=false
> OPENROUTER_API_KEY=your_openrouter_api_key
> OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
> OPENROUTER_PROVIDER_TIMEOUT_MS=150000
> OPENROUTER_NEX_TIMEOUT_MS=220000
> OPENROUTER_QWEN_CODER_MODEL=qwen/qwen3-coder
> OPENROUTER_NEMOTRON_SUPER_MODEL=nvidia/nemotron-3-super-120b-a12b
> OPENROUTER_POOLSIDE_LAGUNA_MODEL=poolside/laguna-m.1
> OPENROUTER_QWEN_JSON_MODE=false
> OPENROUTER_NEMOTRON_JSON_MODE=false
> OPENROUTER_LAGUNA_JSON_MODE=false
> ```
>
> Leave provider JSON mode flags off unless you have confirmed that the selected endpoint supports `json_object`. Site Agent browser-verification failures are discarded by default instead of creating unusable review bundles; set `AGENT_KEEP_FAILED_REVIEW_BUNDLES=true` only if you want to inspect those failed bundles.
>
> Site Agent requests can exceed the normal browser request timeout because model generation and browser verification both run before a response is returned. Put this in `frontend/.env`:
>
> ```env
> VITE_AGENT_API_TIMEOUT_MS=300000
> ```

> **Email setup (optional for now):** If you want the outreach email feature to work, you need to fill in the email fields. The easiest way is a Gmail account with an App Password:
> 1. Go to your Google Account → Security → 2-Step Verification (must be enabled)
> 2. Then go to Security → App passwords
> 3. Create an app password for "Mail"
> 4. Use that 16-character password for `EMAIL_PASSWORD`

### Run the database migration

This creates all the tables in your database:

```bash
node config/migrate.js
```

You should see:
```
✅ Connected to PostgreSQL database
  ✅ users table created
  ✅ projects table created
  ✅ blocks table created
  ✅ media table created
  ✅ portfolio_settings table created
  ✅ portfolio_views table created
  ✅ integration_requests table created
  ✅ Indexes created

🎉 Database migration completed successfully!
```

If you see an error, the most common causes are:
- Wrong password in `.env` → double-check `DB_PASSWORD`
- Database not running → make sure Postgres.app shows "Running" (Mac) or the service is started (Windows)

### Start the backend server

```bash
npm run dev
```

You should see:
```
🚀 ProjectFolio API Server
   Running at: http://localhost:5000
   Health check: http://localhost:5000/health
   Environment: development
✅ Connected to PostgreSQL database
```

**Leave this terminal window open.** The server runs as long as this window is open.

> **Test it:** Open your browser and go to `http://localhost:5000/health`  
> You should see: `{"status":"ok","timestamp":"...","version":"1.0.0"}`  
> If you see that, your backend is working! ✅

---

## Step 4 — Run the frontend

Open a **second terminal window** (keep the first one running the backend).

```bash
cd path/to/projectfolio/frontend
```

Install dependencies:

```bash
npm install
```

Start the frontend:

```bash
npm run dev
```

You should see:
```
  VITE v5.0.8  ready in 342 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.x.x:3000/
```

Open your browser and go to `http://localhost:3000`

You should see the ProjectFolio landing page! 🎉

---

## Step 5 — Create your first portfolio

### Register an account

1. Click **"Get started free"** on the landing page
2. Fill in your name, email, and password
3. Click **"Create account"**

You'll be taken to your dashboard.

### Set up your profile

1. Click **"Profile"** in the left sidebar
2. Fill in:
   - **Headline:** e.g., "Mechanical Engineering @ MIT · Research Intern"
   - **Bio:** A few sentences about yourself
   - **Skills:** Type a skill and press Enter (e.g., SolidWorks, Python, MATLAB)
   - **LinkedIn URL** and **GitHub URL**
3. Click **"Save profile"**

### Create your first project

1. Click **"+ New Project"** in the dashboard
2. Type a title (e.g., "Quadcopter Design for Search and Rescue")
3. Add a tagline (one sentence)
4. Use the block editor to add content:
   - Click **"+ Add block"** to add text, images, headings
   - Drag an image into an Image block to upload it
   - Add a Code block for any code you wrote
   - Add a Callout block for key results or insights
5. Go to the **Settings tab** to add:
   - A cover image
   - Technologies used (type + Enter)
   - Start/end dates
   - GitHub and live demo links
6. Click **"Publish"** when ready

### View your public portfolio

Click **"View My Portfolio"** in the sidebar, or go to:
```
http://localhost:3000/your-username
```

This is exactly what a recruiter or program officer sees when they visit your link.

---

## Step 6 — Integrate with Job Platforms

Go to **Integrations** in your sidebar. You have three tools:

### Option A: Share your URL (simplest — works everywhere)

Your portfolio URL is:
```
http://localhost:3000/your-username
```

When deployed (see next section), it becomes something like:
```
https://projectfolio.yourname.com/your-username
```

**Where to paste it:**
- **Zintellect / ORISE:** In your personal statement, or any "Additional Materials" or "Portfolio/Website" field
- **LinkedIn:** Profile → Add profile section → Featured → Links
- **Your resume:** Add it next to your email address
- **Email signature:** e.g., `Portfolio: projectfolio.io/janesmith`
- **Handshake:** Profile → Websites section

### Option B: Download and attach (for applications without URL fields)

Go to **Integrations → Share & Export → Download PDF**

This generates a printable HTML file of your entire portfolio that you can:
- Print to PDF (File → Print → Save as PDF)
- Attach directly to applications

### Option C: Cold email to platform teams (for Zintellect, etc.)

Go to **Integrations → Platform Outreach**

1. Click on **"Zintellect (ORISE)"**
2. The system has pre-written a professional outreach email
3. Verify the contact email: `support@zintellect.com`
4. Customize the email body if you want
5. Click **"Send email"**

> **If email isn't configured:** Click "Copy to clipboard" and paste the email into Gmail or Outlook yourself. The content is fully written — you just need to send it.

**What the email does:**  
It introduces ProjectFolio to the Zintellect team, explains the API, and asks them to consider adding a portfolio link field to their application. It includes your live portfolio as an example.

---

## Deploying to the internet

To get a real public URL (so you can actually paste it in applications), you need to deploy your app.

### Recommended: Deploy backend to Railway

Railway is a hosting service that makes this easy. The free tier is enough to start.

1. Go to [railway.app](https://railway.app) and sign up with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Connect your GitHub and push your `backend` folder
4. Add a PostgreSQL service: **"+ New"** → **"Database"** → **"PostgreSQL"**
5. Go to your service → **Variables** → Add all your `.env` values
6. Railway gives you a URL like `your-app.railway.app`
7. Run the migration: In the Railway console, run `node config/migrate.js`

### Deploy frontend to Vercel

Vercel deploys React apps in under 2 minutes.

1. Go to [vercel.com](https://vercel.com) and sign up with GitHub
2. Click **"New Project"** → import your `frontend` folder
3. Add environment variable: `VITE_API_URL=https://your-app.railway.app`
4. Update `vite.config.js` to proxy to your Railway URL
5. Click **"Deploy"** — Vercel gives you a URL like `your-app.vercel.app`

### Update your `.env` for production

On Railway, update:
```env
FRONTEND_URL=https://your-app.vercel.app
APP_URL=https://your-app.railway.app
NODE_ENV=production
```

### Alternative: All-in-one with Render

[render.com](https://render.com) can host both the backend and a PostgreSQL database for free:
1. Create a Web Service for your backend
2. Create a PostgreSQL database
3. Set all environment variables
4. Set the start command to: `npm start`

---

## Troubleshooting

### "Cannot connect to database"
- Make sure PostgreSQL is running (the elephant icon in Mac's menu bar, or the service in Windows)
- Double-check your `DB_PASSWORD` in `.env`
- Make sure the database name is `projectfolio` (lowercase)

### "npm install" fails with errors
- Make sure you're in the right folder (`backend` or `frontend`)
- Try: `npm cache clean --force` then `npm install` again
- On Windows: run Command Prompt as Administrator

### Frontend shows blank page or "Network Error"
- Make sure your backend is running (the first terminal window should still show the server logs)
- Go to `http://localhost:5000/health` — if this doesn't work, your backend isn't running
- Check the backend terminal for error messages

### Image uploads fail
- Check your Cloudinary credentials in `.env` — all three values (cloud name, API key, API secret)
- Make sure there are no extra spaces when pasting the values

### "JWT_SECRET is not defined" error
- Your `.env` file is missing or in the wrong folder
- Make sure `.env` is in the `backend` folder (same level as `server.js`)

### Port already in use
If you see "Error: listen EADDRINUSE :::5000", something is already using port 5000.
Change `PORT=5001` in your `.env` and restart the server.

---

## File structure reference

```
projectfolio/
├── backend/
│   ├── config/
│   │   ├── database.js        ← Database connection
│   │   ├── cloudinary.js      ← Image/video upload config
│   │   └── migrate.js         ← Creates database tables (run once)
│   ├── middleware/
│   │   └── auth.js            ← Protects routes that need login
│   ├── routes/
│   │   ├── auth.js            ← Register, login, profile
│   │   ├── projects.js        ← Project + block CRUD
│   │   ├── portfolio.js       ← Public portfolio pages
│   │   ├── media.js           ← File uploads
│   │   ├── export.js          ← PDF and JSON export
│   │   ├── integrations.js    ← Zintellect outreach, API spec
│   │   └── settings.js        ← Portfolio appearance settings
│   ├── .env.example           ← Template for your .env file
│   ├── package.json           ← Backend dependencies list
│   └── server.js              ← Main server entry point
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── editor/
    │   │   │   └── BlockEditor.jsx    ← The Notion-style editor
    │   │   └── shared/
    │   │       └── DashboardLayout.jsx ← Sidebar + layout
    │   ├── hooks/
    │   │   └── useAuth.jsx     ← Login state management
    │   ├── pages/
    │   │   ├── LandingPage.jsx         ← Homepage
    │   │   ├── LoginPage.jsx           ← Sign in
    │   │   ├── RegisterPage.jsx        ← Sign up
    │   │   ├── DashboardPage.jsx       ← Project list
    │   │   ├── ProjectEditorPage.jsx   ← Create/edit a project
    │   │   ├── PublicPortfolioPage.jsx ← What recruiters see
    │   │   ├── PublicProjectPage.jsx   ← Individual project view
    │   │   ├── IntegrationsPage.jsx    ← Sharing + Zintellect outreach
    │   │   ├── AnalyticsPage.jsx       ← View counts
    │   │   ├── ProfileSettingsPage.jsx ← Edit your profile
    │   │   ├── PortfolioSettingsPage.jsx ← Theme, visibility
    │   │   └── MediaLibraryPage.jsx    ← All uploaded files
    │   ├── utils/
    │   │   └── api.js          ← Axios HTTP client
    │   ├── styles/
    │   │   └── globals.css     ← All CSS styles
    │   └── main.jsx            ← App entry point + routing
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    └── package.json
```

---

## API reference

All API endpoints run at `http://localhost:5000/api/`

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Login → returns JWT token |
| GET | `/auth/me` | Get current user (requires token) |
| PUT | `/auth/profile` | Update profile |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects` | List your projects |
| POST | `/projects` | Create a project |
| GET | `/projects/:id` | Get a project with blocks |
| PUT | `/projects/:id` | Update a project |
| DELETE | `/projects/:id` | Delete a project |
| POST | `/projects/:id/blocks` | Add a block |
| PUT | `/projects/:id/blocks/:blockId` | Update a block |
| DELETE | `/projects/:id/blocks/:blockId` | Delete a block |

### Public Portfolio (no login needed)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/portfolio/:username` | Full public portfolio |
| GET | `/portfolio/:username/:slug` | Single published project |

### Integrations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/integrations/spec` | API documentation (share with platforms) |
| GET | `/integrations/embed/:username` | Embeddable HTML card |
| GET | `/integrations/outreach/template/:platform` | Pre-written email |
| POST | `/integrations/outreach` | Send outreach email |

### Export
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/export/pdf/:username` | Download portfolio as PDF/HTML |
| GET | `/export/portfolio/zip` | Download all data as JSON |
| GET | `/export/project/:id/json` | Download single project as JSON |

---

## Next steps (after you have it working)

1. **Add your real projects** — document 2–3 of your best engineering projects
2. **Get a custom domain** — buy a domain like `janesmith.dev` for ~$12/year on Namecheap, then point it to your Vercel deployment
3. **Send the outreach emails** — go to Integrations → Platform Outreach and send emails to Zintellect and any other platforms you use
4. **Add your portfolio to your resume** — right next to your email address
5. **Share in applications** — paste your portfolio URL into the personal statement, website field, or additional materials section of every application

---

*Built with Node.js · Express · PostgreSQL · React · Vite · Tailwind CSS · TipTap · Cloudinary*
