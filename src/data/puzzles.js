import easy from './easy.json';
import medium from './medium.json';
import hard from './hard.json';
import extreme from './extreme.json';

// The four difficulty sets. Each is a list of boards in src/data/<level>.json; add more with `npm run generate`.
// Each level: display name, its boards, and the localStorage key its results are saved under.
// Change a key only if you replace a level's boards wholesale (old results would point at the wrong boards).
// Board format: see generator/README.md.
export const CATS = {
  easy: { name: 'Easy', data: easy, key: 'parcels-pt3-easy' },
  medium: { name: 'Medium', data: medium, key: 'parcels-pt3-medium' },
  hard: { name: 'Hard', data: hard, key: 'parcels-pt3-hard' },
  extreme: { name: 'Extreme', data: extreme, key: 'parcels-pt3-extreme' },
};
