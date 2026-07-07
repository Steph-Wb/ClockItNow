# Contributing to ClockItNow

Thanks for your interest in contributing! This document explains how to get a development environment running and what we expect from pull requests.

## Development Setup

Prerequisites: **Node.js v24+** (the app uses the built-in `node:sqlite` module — no native addons, no build tools required) and npm.

```bash
git clone https://github.com/Steph-Wb/ClockItNow.git
cd ClockItNow
npm install
cp .env.example .env   # set JWT_SECRET (any random string, 32+ chars)
npm run dev
```

The frontend runs on http://localhost:5173, the API on http://localhost:3001. A fresh SQLite database (`clockitnow.db`) is created on first start.

## Before You Submit

The CI runs a typecheck and a full build on every pull request. Please make sure both pass locally:

```bash
npx tsc -p tsconfig.json --noEmit   # client typecheck
npm run build                       # server typecheck + client bundle
```

## Pull Request Guidelines

- Open an issue first for larger changes, so we can discuss the approach before you invest time.
- Keep pull requests focused — one feature or fix per PR.
- Match the existing code style (TypeScript, functional React components, Tailwind CSS).
- Update the README if your change affects setup, configuration or user-facing behavior.
- Never commit the database file (`clockitnow.db`), `.env` or other local data.

## Reporting Bugs

Please open a [GitHub issue](https://github.com/Steph-Wb/ClockItNow/issues) and include:

- What you did, what you expected, and what happened instead
- Your OS and Node.js version (`node --version`)
- Relevant console/server output if available

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0](LICENSE), the same license that covers the project.
