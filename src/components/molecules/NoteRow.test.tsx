import { fireEvent, render } from '@testing-library/react-native';
import { TextInput as MockTextInput } from 'react-native';

import type { Entry } from '@/core/types';
import { NoteRow } from './NoteRow';

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
