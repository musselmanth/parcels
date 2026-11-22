// Where playtest data and feedback are sent: the address of your Cloudflare Worker
// (see worker/README.md), e.g. 'https://parcels-playtest.yourname.workers.dev'.
// Leave it empty to turn data collection and the feedback form off.
const DEPLOYED_API = 'https://parcels-playtest.tmusselman.workers.dev';

// The deployed address is only used on the real site. On localhost nothing is sent unless you set
// VITE_PLAYTEST_API in a .env.local file (e.g. to a local `npm run dev` of the worker), so testing
// doesn't mix into your playtest data.
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
export const PLAYTEST_API = (import.meta.env.VITE_PLAYTEST_API || (local ? '' : DEPLOYED_API)).replace(
  /\/$/,
  '',
);
