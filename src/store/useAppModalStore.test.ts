import { useAppModalStore } from './useAppModalStore';

describe('useAppModalStore', () => {
  beforeEach(() => {
    useAppModalStore.getState().closeAllAppModals();
  });

  it('opens, replaces, and closes the active modal', () => {
    useAppModalStore.getState().openAppModal({ id: 'settings.root', domain: 'food' });
    useAppModalStore.getState().openAppModal({ id: 'food.goals', domain: 'food' });

    expect(useAppModalStore.getState().stack.at(-1)?.id).toBe('food.goals');

    useAppModalStore.getState().replaceAppModal({
      id: 'food.savedMealPicker',
      domain: 'food',
    });

    expect(useAppModalStore.getState().stack.map((modal) => modal.id)).toEqual([
      'settings.root',
      'food.savedMealPicker',
    ]);

    useAppModalStore.getState().closeAppModal('settings.root');
    expect(useAppModalStore.getState().stack).toHaveLength(2);

    useAppModalStore.getState().closeAppModal();
    expect(useAppModalStore.getState().stack.at(-1)?.id).toBe('settings.root');

    useAppModalStore.getState().openAppModal({
      id: 'food.savedMealPicker',
      domain: 'food',
    });

    useAppModalStore.getState().closeAppModal('food.savedMealPicker');
    expect(useAppModalStore.getState().stack.at(-1)?.id).toBe('settings.root');
  });
});
