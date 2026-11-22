# Playtest data collector

A Cloudflare Worker with a D1 (SQLite) database. The game sends it play data and feedback, and it serves a private page where you can read everything. It runs on Cloudflare's free plan, with no server to look after.

## What gets collected

- **Finished boards:** sent the moment a board is solved or its solution viewed. Includes the time, misses, pops, hints, pairs, locks, the result (Perfect!, hints or Loser) and whether it set a new best time.
- **Play sessions:** a log of everything in a visit, sent in batches every 20 seconds and when the tab is hidden or closed:
  - device and screen size
  - screens visited and boards opened and left
  - each parcel made (and whether it's part of the solution, and whether it was swiped or tapped)
  - misses with the reason
  - pops, pairs, locks, hints and Start over
  - opening How to play, settings changes and installing
- **Feedback:** the in-game form, with a 1–5 rating, a message, an optional name or email, and where the player was.
- **Rough location:** each session and feedback entry records the player's country, region, city and timezone, as Cloudflare works it out from their connection. It's never their precise position, there's no permission prompt, and the IP address isn't stored.

Players are anonymous: a random id kept in their browser. The game's start screen and Settings say that play data, including rough location, is collected.

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

## Leaving out your own play

Two ways, and you can use both:

- **Each of your browsers:** open the game once with `?me` at the end of the address (`https://parcelsgame.com/?me`). That browser is remembered as yours and sends nothing, everything it already sent is deleted, and its Settings says so. Do it once on each device and browser you play on. `?notme` turns it back on.
- **Your home IP, in the Worker:** anything from these addresses is dropped, which catches a browser you forgot to mark, as long as you're on that network. The admin page shows the IP you're visiting from. Add it with:

  ```bash
  npx wrangler secret put IGNORE_IPS        # e.g. 203.0.113.7  (several: comma separated)
  ```

  IPv6 addresses often change their last part, so for those use the start of the address with a `*`, e.g. `2601:5c0:1234:abcd:*`. Home IPs can change too; if your data starts showing up again, check the admin page and update the list. It's kept as a secret, so your IP never goes into the repo.

`?me` deletes what that browser sent under its current player id. If a browser's site data was ever cleared, it got a new id, and anything under the old one stays; to clear that, or everything, run (from `worker/`):

```bash
npx wrangler d1 execute parcels-playtest --remote --command "DELETE FROM events; DELETE FROM games; DELETE FROM feedback;"
```

or just your own player ids (shown on the admin page; use the first 8 characters):

```bash
npx wrangler d1 execute parcels-playtest --remote --command "DELETE FROM events WHERE player LIKE 'abcd1234%'; DELETE FROM games WHERE player LIKE 'abcd1234%'; DELETE FROM feedback WHERE player LIKE 'abcd1234%';"
```

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
