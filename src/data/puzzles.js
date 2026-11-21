import easy from './easy.json';
import medium from './medium.json';
import hard from './hard.json';
import extreme from './extreme.json';

// Four difficulty sets of 50 boards each; every board has its own shape and size.
export const CATS = {
  easy: { name: 'Easy', data: easy, key: 'parcels-pt3-easy' },
  medium: { name: 'Medium', data: medium, key: 'parcels-pt3-medium' },
  hard: { name: 'Hard', data: hard, key: 'parcels-pt3-hard' },
  extreme: { name: 'Extreme', data: extreme, key: 'parcels-pt3-extreme' },
};
