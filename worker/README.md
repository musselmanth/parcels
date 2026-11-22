# Playtest data collector

A Cloudflare Worker with a D1 (SQLite) database. The game sends it play data and feedback, and it serves a private page where you can read everything. It runs on Cloudflare's free plan, with no server to look after.

## What gets collected

- **Finished boards:** sent the moment a board is solved or its solution viewed. Includes the time, misses, pops, hints, pairs, locks, score, stars and whether it set a new best time.
- **Play sessions:** a log of everything in a visit, sent in batches every 20 seconds and when the tab is hidden or closed:
  - device and screen size
  - screens visited and boards opened and left
  - each parcel made (and whether it's part of the solution, and whether it was swiped or tapped)
  - misses with the reason
  - pops, pairs, locks, hints and Start over
  - opening How to play, settings changes and installing
- **Feedback:** the in-game form, with a 1–5 rating, a message, an optional name or email, and where the player was.

Players are anonymous: a random id kept in their browser. The game's start screen and Settings say that play data is collected.

## Set it up (once)

You need Node.js (you already have it) and your Cloudflare account. From this `worker/` folder:

```bash
npm install
npx wrangler login                        # opens a browser to sign in to Cloudflare
npx wrangler d1 create parcels-playtest   # prints a database_id
```

1. Paste that `database_id` into `wrangler.toml` (replacing `REPLACE_WITH_YOUR_DATABASE_ID`).
2. Create the tables, set the password for the admin page, and deploy:

   ```bash
   npm run db:init                           # creates the tables
   npx wrangler secret put ADMIN_KEY         # type a long random password; it protects /admin
   npm run deploy                            # prints your Worker's address, e.g. https://parcels-playtest.<you>.workers.dev
   ```

3. Put that address in `src/config.js` (`DEPLOYED_API`) in the game, then commit and push. The game starts sending data once the new version is live.

Optional: to use `https://api.parcelsgame.com` instead of the workers.dev address, go to Cloudflare → Workers & Pages → parcels-playtest → Settings → Domains & Routes → Add a custom domain. Then use that address in `src/config.js`.

## Read the data

- **The admin page:** open `https://<your worker address>/admin?key=<your ADMIN_KEY>`. It shows:
  - feedback
  - a summary per level: solve rate, average time, hints, misses and pops
  - the latest finished boards
  - the latest sessions
- **CSV files:** the page links to `games.csv`, `sessions.csv`, `feedback.csv` and `events.csv`, which open in Google Sheets or Excel. `events.csv` has every move, in order, per session.
- **Your own SQL:** Cloudflare dashboard → Storage & Databases → D1 → parcels-playtest → Console.

## Files

- `src/index.js`: the Worker (receiving data, the admin page, CSV export). Commented at the top.
- `schema.sql`: the tables (`events`, `games`, `feedback`).
- `wrangler.toml`: the Worker's name, the database binding, and `ALLOWED_ORIGINS` (the sites allowed to send data; add any address you serve the game from).

## Testing locally

```bash
npm run db:init:local
echo "ADMIN_KEY=test" > .dev.vars
npm run dev                               # the collector at http://localhost:8787
```

Then, in the game's folder, create `.env.local` containing `VITE_PLAYTEST_API=http://localhost:8787` and restart `npm run dev`. The game only sends data from localhost when `.env.local` says to, so your own testing never mixes into real playtest data. `.env.local`, `.dev.vars` and the local database (`.wrangler/`) are git-ignored.

## Free plan limits

Workers allow 100,000 requests a day, and D1 allows 100,000 rows written a day. A typical session sends a handful of batches and a few hundred rows, so there's plenty of room for a playtest.
