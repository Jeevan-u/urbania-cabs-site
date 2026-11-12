# Urbania Cabs Bangalore

An enquiry-based website for **Urbania Cabs Bangalore**, a premium cab rental service in Bangalore, Karnataka. The site is built as static HTML, CSS and vanilla JavaScript with two small Vercel serverless functions for team notifications and Google Places address suggestions.

- Website: `https://www.urbaniacabsbanglore.com`
- Phone and WhatsApp: `+91 96323 45415`
- Email: `skycabsbangalore@gmail.com`
- Location: Bangalore, Karnataka
- Service model: enquiry only. No payment is collected on the website, no price is displayed, and no booking is confirmed until the team replies.

## What is included

- Responsive premium design with a self-hosted font pair (Manrope and Fraunces) and an inline SVG icon sprite.
- Video hero with a poster fallback and a configurable video path.
- Four dynamic enquiry types: outstation, local rental, airport transfer and corporate booking.
- Google Places autocomplete, current-location support, permission-denial handling and manual address entry.
- Enquiry delivery through a formatted WhatsApp message to `+91 96323 45415`, plus an optional Telegram notification to the team.
- Honeypot, timing check, client duplicate protection and server rate limiting.
- Fleet cards, service sections, airport, local, outstation, corporate and group travel sections, locations, FAQ and contact details.
- SEO metadata, canonical URLs, Open Graph and Twitter cards, `TaxiService` JSON-LD, `FAQPage` JSON-LD, sitemap, robots file, web manifest and favicons.
- Privacy notice, terms and a custom 404 page.
- Vercel configuration with security headers, clean URLs and a Content Security Policy.
- Local development server, automated tests and a production check/build script.

## Project structure

```text
.
├── index.html                  Main website
├── privacy.html                Privacy notice
├── terms.html                  Terms of use
├── 404.html                    Custom not-found page
├── manifest.webmanifest        Web app manifest
├── robots.txt                  Crawler rules
├── sitemap.xml                 Sitemap
├── favicon.svg                 Primary favicon
├── favicon-32.png              Small favicon
├── favicon-512.png             Large icon
├── apple-touch-icon.png        Apple touch icon
├── assets/
│   ├── css/styles.css          Full design system
│   ├── js/main.js              All front-end behaviour
│   ├── fonts/                  Self-hosted WOFF2 fonts
│   ├── img/                    Optimised WebP images, OG image, icons, hero poster
│   └── urbania-hero.mp4        Hero video (not included, see below)
├── images/                     Original JPG and PNG source images
├── api/
│   ├── enquiry.js              Vercel function: validation, Telegram, WhatsApp URL
│   └── places.js               Vercel function: Places proxy and reverse lookup
├── lib/
│   ├── enquiry.js              Shared validation and message formatting
│   └── rate-limit.js           In-memory rate limiter
├── scripts/
│   ├── dev-server.js           Local static + API server
│   ├── build.js                Production checks and dist/ export
│   └── smoke.js                Headless Chrome browser smoke test
├── tests/                      Node test runner tests
├── .env.example                Environment variable template
├── package.json
└── vercel.json
```

## Local development

Requirements: Node.js 20 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

The local server serves the static site, maps clean URLs such as `/privacy` to `privacy.html`, and runs `api/enquiry.js` and `api/places.js` with the same request shape Vercel uses. It loads `.env` automatically. The console prints whether Telegram and Google Places are configured, without printing any secret values.

Useful commands:

```bash
npm test          # run the automated tests
npm run build     # verify the site and create dist/
npm run check     # tests + build
```

## Environment variables

Copy `.env.example` to `.env` for local use. Add the same variables in Vercel under **Project → Settings → Environment Variables** for Production, Preview and Development.

### Telegram team notifications

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the bot token.
2. Add the bot to the private team chat or group.
3. Get the chat ID. For a group it usually starts with a minus sign.
4. Set:

```bash
TELEGRAM_BOT_TOKEN=123456:your-bot-token
TELEGRAM_CHAT_ID=-1001234567890
```

When these are missing, the API still accepts a valid enquiry and returns the prepared WhatsApp link, but reports `notified: false`. The website then tells the visitor to press send in WhatsApp. It never claims the team was notified when it was not.

### Google Places address suggestions

1. In Google Cloud, enable **Places API (New)**.
2. Create a server-side API key and restrict it to Places API (New). Do not add an HTTP referrer restriction because the key is used from the server.
3. Set `GOOGLE_MAPS_API_KEY` in `.env` and in Vercel.

The browser calls `/api/places`; the key never reaches the client. If the key is missing or the API fails, the form shows a clear notice and manual address entry continues to work.

The current-location button uses the browser geolocation permission and the Places `searchNearby` endpoint to turn coordinates into an address. If reverse lookup fails, it inserts the coordinates so the enquiry can still be sent.

## Hero video

The required path is:

```text
assets/urbania-hero.mp4
```

The video file is **not included** in this repository. The hero uses `assets/img/hero-poster.webp` until the file is added. The JavaScript checks for the file with a `HEAD` request, then adds the video source only when it exists. This avoids a broken video element and layout shift.

Recommended format: H.264 MP4, 1920×1080 or 1280×720, muted-friendly, no audio dependency, ideally under 6–8 MB. Keep the poster image visually close to the first video frame.

If you prefer a different path, change `data-src` on the `[data-hero-video]` element in `index.html` and the matching path check in `assets/js/main.js` / `scripts/build.js`.

## WhatsApp flow

The visitor submits the form. The browser:

1. Validates the active trip panel.
2. Builds a formatted WhatsApp message.
3. Opens a WhatsApp tab (`wa.me/919632345415`) with the message pre-filled.
4. Sends the same enquiry to `/api/enquiry` so the team can receive a Telegram notification.

If the API is unavailable, the WhatsApp tab still opens and the page shows an honest warning. If the browser blocks the new tab, a visible **Open WhatsApp** button is shown instead.

The number appears in:

- `assets/js/main.js` (`WHATSAPP_NUMBER`)
- `lib/enquiry.js` (`WHATSAPP_NUMBER`)
- static `wa.me` links in `index.html`, `privacy.html`, `terms.html` and `404.html`

Update all of them if the number changes.

## Vercel deployment

1. Push the project to a Git repository.
2. Import the repository in Vercel.
3. Framework preset: **Other**. `vercel.json` sets the build command to `npm run build` and the output directory to `dist`, so the validation step runs on every deploy. The `api/` folder is still detected and deployed as serverless functions. Do not override the output directory in the dashboard.
4. Add the environment variables from `.env.example`.
5. Deploy.
6. In **Project → Settings → Domains**, add `urbaniacabsbanglore.com` and `www.urbaniacabsbanglore.com`.
7. Set the primary domain to `https://www.urbaniacabsbanglore.com` (the canonical URLs use `www`).
8. Point the domain's DNS records to Vercel as instructed in the dashboard. Wait for the certificate to be issued.

After deployment, test:

- `https://www.urbaniacabsbanglore.com/`
- `https://www.urbaniacabsbanglore.com/privacy`
- `https://www.urbaniacabsbanglore.com/terms`
- A deliberately wrong URL for the 404 page.
- A real enquiry with Telegram configured, confirming the message arrives in the team chat.
- The current-location button on a phone, both allowing and denying permission.
- Address suggestions with the Places key configured, and manual entry with the key removed.

### Static hosting without serverless functions

`npm run build` writes a deployable static copy to `dist/`. You can upload `dist/` to cPanel, Netlify or GitHub Pages. The WhatsApp enquiry flow and manual address entry still work, but:

- Telegram notifications require the `api/` functions and will not run on a purely static host.
- Google Places suggestions require the `api/places` proxy and will show the manual-entry notice.

For the complete experience, deploy to Vercel.

## Security notes

- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and `GOOGLE_MAPS_API_KEY` are read only by server code.
- The Google key is never placed in HTML or JavaScript.
- The enquiry API uses a honeypot field, a minimum form-fill time, payload-size checks and an in-memory rate limit of 8 enquiries per IP per 10 minutes.
- The Places proxy limits lookups to 90 per IP per minute.
- The Content Security Policy in `vercel.json` allows only same-origin scripts, styles, fonts, images and connections, plus hashes for the two JSON-LD blocks.
- If you edit either JSON-LD block in `index.html`, recompute the hashes and replace them in `vercel.json`:

```bash
node - <<'NODE'
const fs = require('fs');
const crypto = require('crypto');
const html = fs.readFileSync('index.html', 'utf8');
const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
let match;
while ((match = re.exec(html))) {
  console.log('sha256-' + crypto.createHash('sha256').update(match[1]).digest('base64'));
}
NODE
```

- Do not add inline event handlers or inline styles. The build script fails if it finds them.

## Content rules

This site deliberately avoids invented claims:

- No customer testimonials, star ratings or review counts.
- No certifications, awards or partner logos that have not been supplied.
- No vehicle prices, per-kilometre rates or guaranteed availability.
- No seating-capacity promises beyond “capacity confirmed on enquiry”.
- No street address beyond “Bangalore, Karnataka”.

When adding content, keep the same standard. If a claim cannot be verified, leave it out or mark it as confirmed on enquiry.

## Testing checklist

Automated:

```bash
npm test
npm run build
```

Browser smoke test (requires Chrome and a running dev server):

```bash
npm run dev
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9222 \
  --user-data-dir=/tmp/urbania-chrome about:blank
node scripts/smoke.js
```

The smoke test checks trip tabs, validation, the WhatsApp flow, location denial, the mobile menu, overflow from 320 px to 1440 px, image loading, legal pages and console errors. It ignores the expected 404 for the optional hero video while that file is absent.

Manual:

1. Resize from 320 px to 1440 px and check there is no horizontal overflow.
2. Open the mobile menu with the keyboard, tab through it, press Escape and confirm focus returns.
3. Switch all four trip tabs and confirm the hidden panels are disabled and the visible panel validates.
4. Submit with empty fields, an invalid phone, a past date and a return date before the pickup date.
5. Submit a valid outstation, local, airport and corporate enquiry.
6. Confirm the WhatsApp message includes the correct trip details and reference.
7. Test with Telegram configured: the message should arrive in the team chat.
8. Test with Telegram removed: the page should say the instant notification was not configured, not that it succeeded.
9. Test address suggestions with the Places key, then remove the key and confirm the manual-entry notice appears.
10. Test the current-location button with permission allowed and denied.
11. Check the browser console for errors on every page.
12. Confirm the hero poster appears when `assets/urbania-hero.mp4` is missing, and the video plays when it is present.
13. Run Lighthouse on mobile and desktop.

## Known gaps

- `assets/urbania-hero.mp4` is not supplied. Add it to enable the video hero; the poster fallback is already in place.
- Telegram and Google Places credentials are not supplied. The integrations are built and documented but remain unconfigured until the environment variables are set.
- Vehicle photographs are illustrative. Confirm the actual vehicle and seating layout with each enquiry.

## Contact

Urbania Cabs Bangalore  
Bangalore, Karnataka  
Phone / WhatsApp: [+91 96323 45415](tel:+919632345415)  
Email: [skycabsbangalore@gmail.com](mailto:skycabsbangalore@gmail.com)


## Supabase booking database (new)

The Supabase integration is optional until configured. When the server-side Supabase variables are present, each valid enquiry is saved to `public.bookings` before Telegram/WhatsApp handoff. If the database is configured but cannot save, the API returns a clear error and a WhatsApp fallback URL; it does not silently report that the enquiry was stored.

### Setup

1. Create or open your Supabase project.
2. In **SQL Editor**, run the complete script in `supabase/schema.sql`.
3. In **Project Settings → API**, copy the Project URL and publishable/anon key.
4. Add these variables to Vercel under **Project → Settings → Environment Variables** for Production, Preview and Development:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Add the same values to your local `.env` file for local testing.
6. Redeploy the Vercel project after saving the environment variables.

**Security:** `SUPABASE_SERVICE_ROLE_KEY` is a secret. Keep it only in Vercel server environment variables and your private local `.env`. Never put it in HTML, browser JavaScript, GitHub, screenshots or chat. The SQL schema enables Row Level Security and intentionally creates no public policies for bookings, vehicles, drivers or assignments.

### First admin account

1. In Supabase **Authentication → Users**, create/invite the business owner's login.
2. Copy that user's UUID.
3. In SQL Editor, run the profile insert below after replacing the email and display name:

```sql
insert into public.profiles (id, full_name, role)
select id, 'Business Owner', 'owner'
from auth.users
where email = 'OWNER_EMAIL'
on conflict (id) do update set role = 'owner';
```

The `/api/admin-bookings` endpoint accepts a Supabase Auth access token in the Authorization Bearer header. It allows an authenticated `admin` or `owner` profile to list the latest 100 bookings and update a booking status. It returns 401/403 for unauthenticated/non-admin users.

### Current implementation boundary

This commit adds database schema, server-side booking persistence and a protected admin bookings API. It does **not yet include** the browser login/OTP screens, a visual admin dashboard, customer self-service booking history, or fleet/driver management screens and APIs. Phone OTP also needs an SMS provider configured in Supabase and may incur charges. These should be added as separate tested stages rather than exposing privileged database access to the browser.
