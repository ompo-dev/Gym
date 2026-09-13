import { cutoutGeometry, expandPhotoCutouts, parsePhotoScan, persistedPhotoFields, selectedPhotoDescription } from './photo-cutouts';

const item = {
  label: 'Cafe', description: 'Um copo de cafe com leite',
  box_2d: [100, 200, 700, 600],
  mask: [[500, 0], [1000, 500], [500, 1000], [0, 500]],
};

test('keeps repeated foods as distinct instances and excludes deselected objects from nutrition context', () => {
  const cutouts = parsePhotoScan({ items: [item, { ...item, description: 'Segundo copo' }] });
  expect(new Set(cutouts.map((value) => value.id)).size).toBe(2);
  const photo = { id: 'photo1', kind: 'foodPhoto' as const, uri: 'source.jpg', description: '', width: 800, height: 1200, cutouts: cutouts.slice(0, 1) };
  expect(expandPhotoCutouts([photo])[0]).toMatchObject({ id: 'photo1:item-1', uri: 'source.jpg' });
  expect(selectedPhotoDescription(photo)).toContain('mediaId=photo1:item-1');
  expect(selectedPhotoDescription(photo)).not.toContain('Segundo copo');
  expect(selectedPhotoDescription(photo)).not.toContain('photo1:item-2');
});

test('maps box-relative contour coordinates correctly on a portrait photo', () => {
  const [cutout] = parsePhotoScan({ items: [item] });
  expect(cutoutGeometry(cutout, 800, 1200)).toEqual({
    x: 160, y: 120, width: 320, height: 720,
    viewBox: '160 120 320 720', points: '320,120 480,480 320,840 160,480',
  });
});

test('rejects inverted boxes, off-image coordinates, and empty contours', () => {
  for (const invalid of [
    { ...item, box_2d: [900, 200, 700, 600] },
    { ...item, mask: [[-1, 0], [1000, 1000], [0, 1000]] },
    { ...item, mask: [[0, 0], [500, 500], [1000, 1000]] },
  ]) expect(() => parsePhotoScan({ items: [invalid] })).toThrow();
  expect(parsePhotoScan({ items: [] })).toEqual([]);
});

test('survives JSON persistence while discarding corrupt contour metadata', () => {
  const cutouts = parsePhotoScan({ items: [item] });
  const photo = { width: 800, height: 1200, cutouts };
  expect(persistedPhotoFields(JSON.parse(JSON.stringify(photo)))).toEqual(photo);
  expect(persistedPhotoFields({ ...photo, cutouts: [{ broken: true }] }).cutouts).toBeUndefined();
});
