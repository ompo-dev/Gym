import { notesForDate, photosForDate } from './limits';

test('notesForDate counts across food+workout for the matching date', () => {
  const count = notesForDate(
    [
      { date: '2026-07-13', entries: [{}, {}, {}] },
      { date: '2026-07-13', entries: [{}] },
    ],
    '2026-07-13',
  );
  expect(count).toBe(4);
});

test('notesForDate excludes days whose date differs', () => {
  const count = notesForDate(
    [
      { date: '2026-07-13', entries: [{}, {}, {}] },
      { date: '2026-07-14', entries: [{}, {}, {}, {}, {}] },
    ],
    '2026-07-13',
  );
  expect(count).toBe(3);
});

test('notesForDate returns 0 when no day matches', () => {
  const count = notesForDate(
    [
      { date: '2026-07-14', entries: [{}, {}] },
      { date: '2026-07-15', entries: [{}] },
    ],
    '2026-07-13',
  );
  expect(count).toBe(0);
});

test('notesForDate returns 0 for empty entries arrays', () => {
  const count = notesForDate(
    [
      { date: '2026-07-13', entries: [] },
      { date: '2026-07-13', entries: [] },
    ],
    '2026-07-13',
  );
  expect(count).toBe(0);
});

test('photosForDate counts foodPhoto/menuPhoto media across entries for the matching date', () => {
  const count = photosForDate(
    [
      {
        date: '2026-07-13',
        entries: [
          { media: [{ kind: 'foodPhoto' }, { kind: 'foodPhoto' }] },
          { media: [{ kind: 'menuPhoto' }] },
        ],
      },
      {
        date: '2026-07-13',
        entries: [{ media: [{ kind: 'foodPhoto' }] }],
      },
    ],
    '2026-07-13',
  );
  expect(count).toBe(4);
});

test('photosForDate excludes barcode kind', () => {
  const count = photosForDate(
    [
      {
        date: '2026-07-13',
        entries: [
          {
            media: [
              { kind: 'foodPhoto' },
              { kind: 'barcode' },
              { kind: 'menuPhoto' },
            ],
          },
        ],
      },
    ],
    '2026-07-13',
  );
  expect(count).toBe(2);
});

test('photosForDate excludes days whose date differs', () => {
  const count = photosForDate(
    [
      {
        date: '2026-07-13',
        entries: [{ media: [{ kind: 'foodPhoto' }] }],
      },
      {
        date: '2026-07-14',
        entries: [{ media: [{ kind: 'foodPhoto' }, { kind: 'foodPhoto' }] }],
      },
    ],
    '2026-07-13',
  );
  expect(count).toBe(1);
});

test('photosForDate: entries with no media contribute 0', () => {
  const count = photosForDate(
    [
      {
        date: '2026-07-13',
        entries: [{ media: undefined }, {}],
      },
      {
        date: '2026-07-13',
        entries: [{ media: [] }],
      },
    ],
    '2026-07-13',
  );
  expect(count).toBe(0);
});
