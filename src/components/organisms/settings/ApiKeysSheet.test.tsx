import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { t } from '@/i18n';
import { ApiKeysSheet } from './ApiKeysSheet';

const mockSetApiKeys = jest.fn().mockResolvedValue(undefined);
const mockApiKeys = { mode: 'own', chat: 'fixture-text-key', image: 'fixture-image-key' };
jest.mock('@/store/useAppStore', () => ({
  useAppStore: (select: (state: unknown) => unknown) => select({
    apiKeys: mockApiKeys,
    setApiKeys: mockSetApiKeys,
  }),
}));
jest.mock('@/components/atoms/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('./primitives', () => {
  const { View, Pressable, Text } = jest.requireActual('react-native');
  return {
    Divider: () => null,
    Section: ({ children }: { children: ReactNode }) => <View>{children}</View>,
    PageSheet: ({ children, onSave }: { children: ReactNode; onSave: () => void }) => <View>
      {children}<Pressable accessibilityRole="button" accessibilityLabel="save" onPress={onSave}><Text>save</Text></Pressable>
    </View>,
  };
});

beforeEach(() => jest.clearAllMocks());

test('the provider-key modal preserves separate, masked text and image credentials', async () => {
  const screen = await render(<ApiKeysSheet visible onClose={() => {}} />);
  expect(screen.getByLabelText(t('settings.api.chatKey')).props.secureTextEntry).toBe(true);
  expect(screen.getByLabelText(t('settings.api.imageKey')).props.secureTextEntry).toBe(true);
  await fireEvent.changeText(screen.getByLabelText(t('settings.api.chatKey')), 'deepseek:fixture-text');
  await fireEvent.changeText(screen.getByLabelText(t('settings.api.imageKey')), 'gemini:fixture-image');
  await fireEvent.press(screen.getByRole('button', { name: 'save' }));
  expect(mockSetApiKeys).toHaveBeenCalledWith({ mode: 'own', chat: 'deepseek:fixture-text', image: 'gemini:fixture-image' });
});
