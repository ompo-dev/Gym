import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import {
  type AppModal,
  APP_MODAL_LABELS,
  APP_MODAL_LINKS,
  canOpenAppModal,
  type AppModalId,
  COMPOSER_TRAY,
} from './appModals';

const modalIds = Object.keys(APP_MODAL_LABELS) as AppModalId[];

describe('app modal registry', () => {
  it('has no link pointing at an id that does not exist', () => {
    const unknown = Object.entries(APP_MODAL_LINKS).flatMap(([from, targets]) =>
      (targets as AppModalId[])
        .filter((target) => !modalIds.includes(target))
        .map((target) => `${from} -> ${target}`),
    );

    expect(unknown).toEqual([]);
  });

  it('allows only mapped modal chain transitions', () => {
    expect(canOpenAppModal('settings.root', 'settings.pantry')).toBe(true);
    expect(canOpenAppModal('settings.nutritionGoals', 'settings.healthProfile')).toBe(true);
    expect(canOpenAppModal('food.actionMenu', 'food.aiEdit')).toBe(true);
    expect(canOpenAppModal('onboarding.root', 'onboarding.picker')).toBe(true);
    // Not a link: reaching this one goes through settings.weightControl.
    expect(canOpenAppModal('settings.nutritionGoals', 'settings.registerWeight')).toBe(false);
  });
});

/**
 * The registry is a graph of ids; nothing in it knows whether a component
 * actually shows the thing. `settings.pantry` shipped registered, linked and
 * openable — and invisible, because no sheet was gated on it and the tests were
 * a hand-written list of ids nobody had extended. Reading the source is ugly,
 * and it is the only check here that fails when the two drift apart.
 */
describe('every registered settings modal is rendered by a sheet', () => {
  // Every sheet, not a hand-kept list of two: the pickers are gated inside the
  // sheet that owns them, and naming files here is the same rot the check exists
  // to catch.
  const organisms = join(__dirname, '../components/organisms');
  const source = [organisms, join(organisms, 'settings')]
    .flatMap((dir) =>
      readdirSync(dir)
        .filter((file) => file.endsWith('.tsx'))
        .map((file) => readFileSync(join(dir, file), 'utf8')),
    )
    .join('\n');

  const settingsIds = modalIds.filter((id) => id.startsWith('settings.'));

  it.each(settingsIds)('%s is gated on somewhere', (id) => {
    expect(source).toContain(`"${id}"`);
  });
});

/**
 * The same shape of defect twice: one modal id, many mounts. Every note with
 * photos renders its own draft tray, and gating them on the id alone turned all
 * of them visible at once — the user tapped their note's thumbnails and got
 * another note's photos. `settings.pantry` failed the same way against the
 * settings root.
 */
describe('a modal that can be mounted more than once is told apart', () => {
  const trayFor = (ownerId: string): AppModal => ({
    id: 'food.mediaDraftTray',
    domain: 'food',
    ownerId,
  });

  const isOpenFor = (active: AppModal | undefined, ownerId: string) =>
    active?.id === 'food.mediaDraftTray' && active.ownerId === ownerId;

  it('opens only the tray that was tapped', () => {
    const active = trayFor('entry-2');

    expect(isOpenFor(active, 'entry-2')).toBe(true);
    expect(isOpenFor(active, 'entry-1')).toBe(false);
    expect(isOpenFor(active, COMPOSER_TRAY)).toBe(false);
  });

  it('keeps the note being written apart from the notes already saved', () => {
    expect(isOpenFor(trayFor(COMPOSER_TRAY), 'entry-1')).toBe(false);
    expect(isOpenFor(trayFor(COMPOSER_TRAY), COMPOSER_TRAY)).toBe(true);
  });
});
