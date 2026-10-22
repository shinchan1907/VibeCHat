# VibeChat — Analysis, Security Fixes & Deployment Notes

_Analyzed & deployed 2026-10-22. Live: https://vibechat.bytenex.io (Bytenex Cloudflare account, `contact@bytenex.io`)._

## What this app is

Single-business WhatsApp Business (WABA) console, 100% Cloudflare:
React 18 + Vite SPA (Static Assets) + Hono Worker API + D1 (`waba-db`) + R2 (media) + `send_email` binding.
~10.4k LOC: Inbox (24h window), Templates, Broadcasts, Meta Flows builder, If/Else chatbot builder, Contacts, Audit logs, OTP admin auth.

## Critical security findings (all fixed in code, deployed)

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | **CRITICAL** | `POST /api/auth/send-otp` returned the OTP itself (`previewCode`) in the API response in **every** mode. Anyone who knew the (public) admin email got a full 30-day admin session. Email OTP was decorative. | OTP only ever returned when `ENVIRONMENT=development`; production send paths no longer expose it; undeliverable mail returns an honest 502. |
| 2 | **CRITICAL** | Webhook `POST /api/webhook` had **no signature verification** — anyone could inject fake customer messages/statuses and trigger bot replies (real WhatsApp sends). | `X-Hub-Signature-256` HMAC-SHA256 verified against the stored App Secret (timing-safe compare), enforced as soon as an App Secret is saved in Settings. |
| 3 | **HIGH** | Cloudflare Access login trusted the `Cf-Access-Authenticated-User-Email` header with **no JWT verification** — spoofable by anyone reaching the worker directly. | Full Access JWT verification (JWKS/RS256, iss/exp/aud, email match). Path stays disabled until `CF_ACCESS_TEAM_DOMAIN` is configured. |
| 4 | **HIGH** | OTP generated with `Math.random()`, no rate limits, unlimited verify attempts → brute-forceable. | Crypto OTP; max 5 sends / 15 min per email+IP; OTP burns after 5 wrong verify attempts (new `attempts`/`ip` columns). |
| 5 | **MEDIUM** | CORS `origin: '*'` with `Authorization` allowed. | Origin allowlist: bytenex.io zone, this account's workers.dev, localhost. |
| 6 | **MEDIUM** | No security headers. | `hono/secure-headers`: CSP, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy (verified live). |
| 7 | **MEDIUM** | Media upload: any type, any size; keys guessable; customer media served with year-long **public** cache. | 16MB cap + type allowlist; crypto-UUID keys; proxy cache now `private`; uploaded HTML/SVG neutralized to downloads. |
| 8 | **LOW** | Hard-coded public webhook verify token `bytenex_waba_verify_2026` as code fallback. | Fail-closed fallback (env only); live DB token rotated to a fresh private value at deploy. |
| 9 | Info | WABA access token + App Secret are stored **plaintext in D1** by design (Settings UI). Acceptable for a single-admin tool; protect the account + D1 accordingly. Mock mode in `meta-api.ts` returns fake "sent" when no credentials — broadcasts will look successful while nothing is sent. |

Still open (P1): session token in `localStorage` (XSS = session theft; CSP mitigates), media file/proxy routes are unauthenticated by design (chat `<img>` tags can't send headers) → move to signed URLs before real customer volume; Meta Graph version pinned at v21.0; no tests anywhere; frontend has pre-existing TypeScript errors (`api.ts`, `ChatInbox`, `ChatbotBuilder`) — worker code typechecks clean.

## UI/UX findings & improvements (deployed)

Done: sidebar was a 74px icon-only rail with tooltip-only labels → now a labeled nav (visible labels, numeric unread badge, user row, `aria-label`/`aria-current`); placeholder "In" logo (copied from a mockup) replaced with the real VibeChat mark on login/loading/sidebar; **WABA-not-connected banner** with a direct Settings link (previously the app just looked offline/broken); login gets `autocomplete="email"` / `one-time-code` + numeric OTP input; visible keyboard focus rings (global `outline:none` removed); modal gets `role="dialog"`/`aria-modal`; `prefers-reduced-motion` respected; page title/branding unified to **VibeChat** (repo says VibeChat, package said "wibechat", UI said "ByteNex WABA" — pick one name and keep it).

Not done (needs a design pass): dark-mode toggle exists in context but has **zero CSS and no button** (dead feature — remove or build it); no URL routing (tab state only — refresh/back lose place); Chatbot/Flows builders are large single-file pages (437–830 LOC); inline styles everywhere limit theming.

## Deployment (2026-10-22)

- Account: **Contact@bytenex.io's Account** `6945667bc2f663e9c5f807238bfe76db` (the Bytenex account — NOT Arogyams).
- Worker `wibechat` + Static Assets; D1 `waba-db` `43d765b0-1c3b-4f5d-a532-48e62bad9ac8` (schema applied, WABA ID seeded, verify token rotated).
- Custom domain **vibechat.bytenex.io** (Workers Custom Domain, proxied). workers.dev left disabled.
- Verified live: `/` 200 (VibeChat SPA), `/api/health` 200 + security headers, `/api/chats` & `/api/settings` 401 unauthenticated, webhook GET verification echoes challenge with the new token (wrong token → 403), SPA deep links 200.
- Deploy script: `scripts/deploy.py` (idempotent, uses the stored Cloudflare credential, contains no secrets).

## Blockers / owner actions

1. **OTP email cannot be delivered yet** → login is blocked. The stored Cloudflare API token has **no Email Routing scope** (all Email Routing API calls return 403). Owner must verify `contact@bytenex.io` as a destination address in the Cloudflare dashboard (Email → Email Routing → Destination addresses). Do **not** enable Email Routing on the bytenex.io zone itself — its MX is Google Workspace.
2. **The provided WhatsApp access token is invalid** — Meta Graph API rejects it on v19/v21/v22 (`/me` → "An active access token must be used", code 2500). A fresh token is required: Meta App → WhatsApp → API Setup (temporary token) or Business Settings → System Users (permanent; `whatsapp_business_messaging` + `whatsapp_business_management`). Also collect from the same page: **Phone Number ID** and **App Secret** (App Settings → Basic).
3. **R2 bucket `waba-media` not created** — token lacks R2 scope (403). Create it in the dashboard or widen the token; until then media uploads fall back to data URLs. After creating it, re-run `scripts/deploy.py` to bind it.
4. **Cloudflare API token expires 2026-10-31** — renew it with scopes: Workers Scripts (Edit), D1 (Edit), R2 (Edit), Email Routing (Edit), DNS (Edit), Zone (Read).
5. After a valid WABA token + App Secret are saved in Settings: set the Meta webhook — Callback URL `https://vibechat.bytenex.io/api/webhook`, Verify Token = the value shown in Settings (rotated at deploy; the old public token is dead), subscribe to `messages`.
