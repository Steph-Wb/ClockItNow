# ClockItNow

A self-hosted, local-first time tracking app — a privacy-friendly alternative to Clockify and similar SaaS tools. All data stays on your machine.

![License](https://img.shields.io/badge/license-AGPL--3.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D24-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)

## Features

- ⏱ **Timer** — Start/stop time entries with project and task assignment
- 📊 **Dashboard** — KPIs, daily bar chart, project and client breakdown
- 👥 **Clients & Projects** — Full master data management with hourly rates
- 📋 **Reports** — Filter by client, project, date range and billability; export as CSV
- 📄 **Arbeitsrapport** — Generate a monthly work report as `.xlsx` directly from time entries, grouped by project and day, with embedded signature image
- ⚙️ **Settings** — Sender name, address and signature image stored once, used in all reports
- 🔐 **Auth** — Password login or magic link (email)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS · Recharts |
| Backend | Node.js · Express · node:sqlite (built-in, no native addons) |
| Export | ExcelJS |

## Getting Started

### Prerequisites

- Node.js **v24+** (uses the built-in `node:sqlite` module)
- npm

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/Steph-Wb/ClockItNow.git
cd ClockItNow

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env: set JWT_SECRET and optionally SMTP settings for magic links

# 4. Start the app
npm run dev
```

The app runs on **http://localhost:5173** (frontend) and **http://localhost:3001** (API).  
On first launch, register an account — the first registered user owns the database.

### Environment Variables

See `.env.example` for all options. The only required variable is:

```
JWT_SECRET=<random string, at least 32 characters>
```

Generate one with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Arbeitsrapport (Work Report Export)

Monthly work reports can be generated as `.xlsx` files in two ways:

**In the app:** Reports page → *Arbeitsrapport (.xlsx)* button → choose client and month.

**Via CLI:**
```bash
npx tsx scripts/arbeitsrapport.ts --month 2026-01 --client "Client Name" \
    [--projekt "Project description"] [--out /path/to/output/]
```

Set up sender name, address and signature image once under **Settings** — they are embedded automatically in every report.

## Project Structure

```
├── server/
│   ├── database.ts          # SQLite schema + migrations
│   ├── lib/
│   │   └── buildArbeitsrapport.ts  # Shared xlsx builder
│   └── routes/              # Express route handlers
├── src/
│   ├── components/          # React components
│   ├── pages/               # Page-level components
│   ├── api/                 # API client
│   └── types/               # Shared TypeScript types
├── scripts/
│   └── arbeitsrapport.ts    # CLI for report generation
└── .env.example
```

## Data & Privacy

All data is stored in a local SQLite file (`clockitnow.db`) that is **never committed to git**.  
No analytics, no telemetry, no external services required.

## License

[GNU Affero General Public License v3.0](LICENSE) — see `LICENSE` for details.

Free to use, self-host and modify. If you offer this software as a network service, the AGPL requires you to make your source code available under the same terms.
