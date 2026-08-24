# Twogether

A private routine, focus, and progress app for two people. Each person has a PIN-protected profile, can only change their own routines, and can see their partner’s progress and live focus status.

## What is included

- One-time setup for a shared space and two profiles
- Separate PIN sign-in with server-side sessions
- Ownership checks on every task change
- Timestamped daily check-ins and recent activity history
- Second-by-second countdowns for every routine with a duration
- Overtime timers that continue below zero until Finish is pressed
- Pause and resume with a required reason from the other three categories
- Frozen primary countdowns while paused, with separate pause-time scoring and focus totals
- Partner-visible live “busy” status
- Four categories with category-specific scoring
- Weekly Study and Productive time totals, scores, progress, and friendly competition
- Responsive layouts for desktop, tablet, and mobile
- Cloudflare D1 schema and generated Drizzle migrations

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Open the local address shown in the terminal. On first use, enter both names and choose a different private PIN for each person. Starter routines are created automatically.

## Verify

```bash
npm run lint
npm run build
node --test tests/rendered-html.test.mjs
```

## Data and future Cloudflare deployment

Structured app data belongs in D1, which is already declared as the `DB` binding in `.openai/hosting.json`. The migrations in `drizzle/` create the six tables and their indexes.

R2 is intentionally left disabled because this version has no file uploads. Add an R2 binding later if you introduce photos, attachments, or exports. Set `SITE_URL` to the final public origin so Open Graph image URLs resolve to the deployed site.

## Scoring

- Study: 2 points per actual minute, plus 5 points on completion
- Productive: 2 points per actual minute, plus 5 points on completion
- Daily essentials: 1 point per actual minute, plus 5 points on completion
- Entertainment: subtracts 0.5 points per actual minute and receives no completion bonus
- Untimed Study, Productive, and Daily essentials routines receive 5 points when checked off

Never commit `.wrangler/` local state or real secrets. For a public deployment, also place the application behind an appropriate Cloudflare access policy; the profile PIN is designed to separate the two app profiles, not replace perimeter security for a public internet service.
