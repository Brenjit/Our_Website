# Twogether

A private routine, focus, and progress app for two people. Each person has a PIN-protected profile, can only change their own routines, and can see their partner’s progress and live focus status.

## What is included

- One-time setup for a shared space and two profiles
- Separate PIN sign-in with server-side sessions
- Per-profile login throttling and temporary lockout after repeated incorrect PIN attempts
- Ownership checks on every task change
- Timestamped daily check-ins and recent activity history
- Second-by-second countdowns for every routine with a duration
- Overtime timers that continue below zero until Finish is pressed
- Pause and resume with a required reason from the other three categories
- Frozen primary countdowns while paused, with separate pause-time scoring and focus totals
- Partner-visible live “busy” status
- Device notifications for scheduled tasks and completed focus timers, including when the app is closed
- Per-profile notification subscriptions with timezone-aware delivery and duplicate protection
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

## Notifications

Closed-app alerts use Web Push: the browser installs `public/sw.js`, each profile opts in per device, and the Cloudflare Worker checks due tasks and timers every minute. Generate a stable VAPID key pair once and store it as Cloudflare secrets:

```bash
npx web-push generate-vapid-keys
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
```

Use a `mailto:` address or HTTPS URL for `VAPID_SUBJECT`. Keep the same key pair between deployments; changing it makes existing devices reconnect. Web Push requires HTTPS in production. On iPhone and iPad, install Twogether to the Home Screen before enabling notifications.

The cron trigger and secret requirements are declared in both Wrangler configs. Apply migrations before the first deployment with notifications enabled:

```bash
npm run db:migrate:remote
```

## Data and Cloudflare deployment

Structured app data belongs in D1, which is already declared as the `DB` binding in `.openai/hosting.json`. The migrations in `drizzle/` create the eleven tables and their indexes, including login throttling, push subscriptions, and delivery history.

R2 is intentionally left disabled because this version has no file uploads. Add an R2 binding later if you introduce photos, attachments, or exports. Set `SITE_URL` to the final public origin so Open Graph image URLs resolve to the deployed site.

## Scoring

- Study: 2 points per actual minute, plus 5 points on completion
- Productive: 2 points per actual minute, plus 5 points on completion
- Daily essentials: 1 point per actual minute, plus 5 points on completion
- Entertainment: subtracts 0.5 points per actual minute and receives no completion bonus
- Untimed Study, Productive, and Daily essentials routines receive 5 points when checked off

Never commit `.wrangler/` local state or real secrets. For a public deployment, also place the application behind an appropriate Cloudflare access policy; the profile PIN is designed to separate the two app profiles, not replace perimeter security for a public internet service.
