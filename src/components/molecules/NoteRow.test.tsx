import { fireEvent, render } from '@testing-library/react-native';
import { TextInput as MockTextInput } from 'react-native';

import type { Entry } from '@/core/types';
import { NoteRow } from './NoteRow';
import { useAppModalStore } from '@/store/useAppModalStore';
import { t } from '@/i18n';

jest.mock('@/components/atoms/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('@/components/molecules/ThinkingIndicator', () => ({ ThinkingIndicator: () => null }));
jest.mock('@/components/onboarding/onboardingNative', () => ({ IOS_NATIVE_ENABLED: false }));
jest.mock('@/components/molecules/WorkoutOutliner', () => ({
  WorkoutOutliner: ({ onFocusLine }: { onFocusLine: () => void }) =>
    <MockTextInput accessibilityLabel="Exercise" onFocus={onFocusLine} />,
}));

test.each(['food', 'workout'] as const)('%s notes report focus without editing or enriching the entry', async (domain) => {
  const focus = jest.fn();
  const edit = jest.fn();
  const entry = { id: 'note', domain, text: 'Banana', status: 'thinking' } as Entry;
  const screen = await render(<NoteRow entry={entry}
    config={{ id: domain, accent: '#ff9900' } as any}
    onEdit={edit} onDelete={jest.fn()} onRetry={jest.fn()} onFocusLine={focus}
  />);
  await fireEvent(screen.getByLabelText(domain === 'food' ? 'Banana' : 'Exercise'), 'focus');
  expect(focus).toHaveBeenCalledTimes(1);
  expect(edit).not.toHaveBeenCalled();
});

test('an unauthenticated photo opens account login instead of repeating a failing inference', async () => {
  useAppModalStore.getState().closeAllAppModals();
  const retry = jest.fn();
  const entry = { id: 'photo', domain: 'food', text: 'Imagens anexadas', status: 'error', error: 'agent.authRequired' } as Entry;
  const screen = await render(<NoteRow entry={entry} config={{ id: 'food', accent: '#ff9900' } as any}
    onEdit={jest.fn()} onDelete={jest.fn()} onRetry={retry} />);
  await fireEvent.press(screen.getByLabelText(t('agent.authRequired')));
  expect(useAppModalStore.getState().stack.at(-1)).toEqual({ id: 'settings.connect', domain: 'food' });
  expect(retry).not.toHaveBeenCalled();
  useAppModalStore.getState().closeAllAppModals();
});

test('a timed out photo keeps a clear retry action', async () => {
  const retry = jest.fn();
  const entry = { id: 'photo', domain: 'food', text: 'Imagens anexadas', status: 'error', error: 'enrich.timeout' } as Entry;
  const screen = await render(<NoteRow entry={entry} config={{ id: 'food', accent: '#ff9900' } as any}
    onEdit={jest.fn()} onDelete={jest.fn()} onRetry={retry} />);
  expect(screen.getByText(t('status.timedOut'))).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: t('status.retry') }));
  expect(retry).toHaveBeenCalledWith(entry);
});
