// A few classic patterns, small enough to embed, each with a well known
// property the tests check against.

export const PATTERNS = {
  glider: {
    note: 'Moves one cell diagonally every 4 generations.',
    rle: 'x = 3, y = 3, rule = B3/S23\nbo$2bo$3o!',
  },
  lwss: {
    note: 'Lightweight spaceship, moves two cells every 4 generations.',
    rle: 'x = 5, y = 4, rule = B3/S23\nbo2bo$o4b$o3bo$4o!',
  },
  'r-pentomino': {
    note: 'Methuselah: settles at generation 1103 with 116 cells (6 gliders escape).',
    rle: 'x = 3, y = 3, rule = B3/S23\nb2o$2o$bo!',
  },
  diehard: {
    note: 'Vanishes completely at generation 130.',
    rle: 'x = 8, y = 3, rule = B3/S23\n6bob$2o6b$bo3b3o!',
  },
  acorn: {
    note: 'Methuselah: settles at generation 5206 with 633 cells.',
    rle: 'x = 7, y = 3, rule = B3/S23\nbo5b$3bo3b$2o2b3o!',
  },
  'gosper-gun': {
    note: 'Gosper glider gun: emits a glider every 30 generations, forever.',
    rle: [
      'x = 36, y = 9, rule = B3/S23',
      '24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4b',
      'obo$10bo5bo7bo$11bo3bo$12b2o!',
    ].join('\n'),
  },
};
