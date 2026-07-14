# ClockItNow — Self-Hosted Time Tracking & Timesheet App

**A local-first, open-source alternative to Clockify: track time, manage clients and projects, and export monthly work reports (timesheets) as Excel — all data stays on your machine.**

[![CI](https://github.com/Steph-Wb/ClockItNow/actions/workflows/ci.yml/badge.svg)](https://github.com/Steph-Wb/ClockItNow/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D24-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)
![React](https://img.shields.io/badge/React-18-61dafb)

ClockItNow is a self-hosted time tracker built for freelancers and small teams who bill by the hour but don't want their data in someone else's cloud. It runs as a single Node.js app with a built-in SQLite database — no Docker, no external services, no telemetry. It can also run as a native Windows desktop app (Electron) with a system tray icon, idle detection and timer reminders.

<!-- TODO: Screenshot — ein Bild des Dashboards (KPIs + Balkendiagramm) hier einfügen, z.B.:
![ClockItNow dashboard showing weekly KPIs, a daily hours bar chart and a per-project breakdown](docs/screenshot-dashboard.png)
-->

## Features

- ⏱ **Timer** — Start/stop time entries with project and task assignment
- 📊 **Dashboard** — KPIs, daily bar chart, project/client breakdown, monthly goal
- 👥 **Clients & Projects** — Full master data management with hourly rates and per-client rounding rules
- 📋 **Reports** — Filter by client, project, date range and billability; export as CSV
- 📄 **Arbeitsrapport** — Generate a monthly work report as `.xlsx` directly from time entries, grouped by project and day, with embedded signature image
- ⚙️ **Settings** — Sender name/address/signature, UI language, and desktop reminder/backup behavior, all stored server-side and shared across every open window
- 🖥️ **Desktop app** — Optional Electron shell: tray icon shows the running timer, idle detection prompts when you've been away, notifications for long-running timers and "nothing tracked" reminders during work hours
- 💾 **Automatic backups** — Rotating SQLite backups (default: every 6 hours, kept for 14 runs) to OneDrive or a folder you choose
- 🔐 **Auth** — Password login or magic link (email, optional)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS · Recharts |
| Backend | Node.js · Express · node:sqlite (built-in, no native addons) |
| Desktop | Electron |
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

# 3. Start the app — that's it, no configuration required
npm run dev
```

The app runs on **http://localhost:5173** (frontend, dev mode with hot reload) and **http://localhost:3001** (API).
On first launch, register an account — the first registered user owns the database.

### Running Modes

| Command | What it does |
|---|---|
| `npm run dev` | Development: Vite dev server (hot reload) + API, two ports |
| `npm run build && npm start` | Production: single Node process on **http://localhost:3001**, serves the built frontend and the API from one port |
| `npm run electron` | Desktop app: builds, then launches the Electron shell (window + system tray) around the production server |

### Configuration (optional)

The app runs with zero configuration: a JWT secret is generated automatically on first start and stored in the data directory (see below). Everything in `.env.example` is optional — copy it to `.env` only if you want to override a default:

- **Magic-link login** — set `SMTP_HOST` and the other `SMTP_*` variables to enable email login (hidden otherwise; password login always works)
- **Data/backup locations, port** — `CLOCKITNOW_DATA_DIR`, `CLOCKITNOW_BACKUP_DIR`, `CLOCKITNOW_PORT`; the backup folder and most desktop-app behavior (work hours, reminder thresholds, backup retention) can also be changed at runtime under **Settings → Desktop & Erinnerungen**, no restart needed for most fields

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
│   │   ├── appPaths.ts             # Data directory resolution (%APPDATA%\ClockItNow)
│   │   ├── backup.ts               # Automatic rotating backups
│   │   ├── secret.ts               # JWT secret auto-generation
│   │   ├── localToken.ts           # Local API token for the Electron tray
│   │   └── buildArbeitsrapport.ts  # Shared xlsx builder
│   └── routes/               # Express route handlers
├── electron/
│   ├── main.ts               # Electron main process: window, tray, idle detection
│   └── trayIcon.ts           # Runtime-rendered app/tray icons (no binary assets)
├── src/
│   ├── components/           # React components
│   ├── pages/                # Page-level components
│   ├── api/                  # API client
│   └── types/                # Shared TypeScript types
├── scripts/
│   └── arbeitsrapport.ts     # CLI for report generation
└── .env.example
```

## Data & Privacy

All data lives in a local SQLite database in `%APPDATA%\ClockItNow\` (Windows) — never in the project folder, never committed to git. Automatic rotating backups run every 6 hours to OneDrive (auto-detected) or a folder you configure under Settings.
No analytics, no telemetry, no external services required.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up a development environment, run the checks and submit a pull request. By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[GNU Affero General Public License v3.0](LICENSE) — see `LICENSE` for details.

Free to use, self-host and modify. If you offer this software as a network service, the AGPL requires you to make your source code available under the same terms.
