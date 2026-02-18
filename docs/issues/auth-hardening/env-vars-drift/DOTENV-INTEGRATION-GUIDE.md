---
id: DOTENV-INTEGRATION-GUIDE
title: dotenv Integration Guide (PT-2 / Next.js + Tooling)
status: draft
owner: PT-2 / Platform
last_updated: 2026-02-17
scope: "dotenv setup for scripts/tooling; Next.js runtime env expectations"
---

# Purpose

This guide explains how to introduce `dotenv` correctly in a Next.js project **without confusing** what Next already does for you.

Key point:

- **Next.js runtime** usually does **not** require `dotenv` (Next loads env files automatically).
- **Node scripts/tooling** (seeders, one-off scripts, CI helpers) **do** benefit from `dotenv`.

---

# 1) Standardize Env Files (Do This First)

Adopt the standard split:

- **`.env.example`** — committed template (no secrets)
- **`.env.local`** — developer machine secrets (gitignored)
- optional: **`.env.test.example`**, **`.env.test.local`** for tests/tooling

## Create `.env.local` from template
```bash
cp .env.example .env.local
```

## Ensure `.gitignore` is correct
Recommended entries:

```gitignore
.env
.env.*
!.env.example
!.env.test.example
```

---

# 2) Next.js Runtime: When You *Do Not* Need dotenv

Next.js loads env files automatically for the app runtime (dev/build/start). If your app is reading env in server components, route handlers, and client code (`NEXT_PUBLIC_*`), you can typically run:

```bash
npm run dev
```

…and you’re done.

> Note: running plain `node` will not automatically load `.env.local`. That’s expected.

---

# 3) Install dotenv (For Scripts/Tooling)

Install `dotenv`:

```bash
npm i dotenv
```

(or `pnpm add dotenv`, `yarn add dotenv`)

---

# 4) Running Node Scripts with dotenv

Important: `dotenv` defaults to reading **`.env`**. If you standardize on **`.env.local`**, you should point `dotenv` to it.

## Option A (Recommended): preload dotenv + set path
Works broadly, including CommonJS:

```bash
DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/foo.js
```

## Option B: Node ESM-style import hook (`--import`)
If you are using modern Node/ESM:

```bash
DOTENV_CONFIG_PATH=.env.local node --import dotenv/config scripts/foo.mjs
```

## Option C: Import inside the script
Inside your script:

```ts
import 'dotenv/config'
```

If you need `.env.local` specifically, be explicit:

```ts
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
```

---

# 5) Make It Repeatable via `package.json`

Add scripts that always load `.env.local`:

```json
{
  "scripts": {
    "env:check": "DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/env-check.js",
    "seed": "DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/seed.js"
  }
}
```

This prevents “works on my machine” and ensures every script uses the same env source.

---

# 6) Guardrail: Don’t Let Scripts Freestyle `process.env`

Even with `dotenv`, avoid scattered raw `process.env.*` references across scripts and app code.

Target posture:

- Scripts load env via dotenv
- Scripts import a shared **validated env module** (single source of truth)
- Missing env fails **loudly** in dev/CI instead of silently degrading runtime behavior

This prevents incidents where:
- `.env.example` drifts from `.env.local`
- a guard checks the wrong key
- middleware bypasses auth refresh silently

---

# 7) Quick Sanity Checks

## App runtime (Next.js)
Start dev server:

```bash
npm run dev
```

If the app runs and reads env correctly, Next is loading env.

## Script runtime (Node)
Without dotenv:

```bash
node -p "process.env.NEXT_PUBLIC_SUPABASE_URL"
```

This is often empty (expected). With dotenv preloaded:

```bash
DOTENV_CONFIG_PATH=.env.local node -r dotenv/config -p "process.env.NEXT_PUBLIC_SUPABASE_URL"
```

This should output the value.

---

# 8) Recommended Defaults (PT-2)

- Dev secrets live in `.env.local`
- Template is `.env.example`
- Scripts/tooling use:
  - `DOTENV_CONFIG_PATH=.env.local node -r dotenv/config ...`
- Follow-on improvement:
  - introduce `src/env/*` validation module and enforce template drift in CI
