// Reading and writing the game's puzzle files (src/data/<level>.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEVELS = ['easy', 'medium', 'hard', 'extreme'];
const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/data');

// Path of a level's data file.
export const dataPath = (level) => path.join(DATA_DIR, `${level}.json`);

// A level's boards, in order (board #1 first).
export function readPuzzles(level) {
  return JSON.parse(fs.readFileSync(dataPath(level), 'utf8'));
}

// One board per block, one field per line, values kept compact.
export function formatPuzzles(list) {
  const board = (p) =>
    '  {\n' +
    Object.entries(p)
      .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(',\n') +
    '\n  }';
  return '[\n' + list.map(board).join(',\n') + '\n]\n';
}

// Replace a level's file with `list`.
export function writePuzzles(level, list) {
  fs.writeFileSync(dataPath(level), formatPuzzles(list));
}

// Two boards are the same puzzle if they have the same cells and the same tiles.
export const boardKey = (p) => p.c.join(',') + '|' + p.t;

// Stored form -> what the engine works with.
export function unpack(p) {
  const cells = [];
  for (let i = 0; i < p.c.length; i += 2) cells.push([p.c[i], p.c[i + 1]]);
  const tiles = [];
  for (let i = 0; i < p.t.length; i += 3) tiles.push({ s: +p.t[i], c: +p.t[i + 1], n: +p.t[i + 2] });
  return { cells, tiles };
}
