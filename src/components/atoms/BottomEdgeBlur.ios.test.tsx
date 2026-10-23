import { render } from '@testing-library/react-native';
import { View as MockView } from 'react-native';

import { BottomEdgeBlur } from './BottomEdgeBlur.ios';

jest.mock('@expo/ui/swift-ui', () => ({
  Host: (props: any) => <MockView testID="bottom-native-host" {...props} />,
  Mask: Object.assign((props: any) => <MockView testID="bottom-native-mask" {...props} />, {
    Content: (props: any) => <MockView testID="bottom-gradient-mask" {...props} />,
  }),
  Rectangle: (props: any) => <MockView testID="bottom-native-rectangle" {...props} />,
}));
jest.mock('@expo/ui/swift-ui/modifiers', () => ({ foregroundStyle: (style: unknown) => ({ type: 'foregroundStyle', style }) }));
jest.mock('@react-native-masked-view/masked-view', () => { throw new Error('The installed IPA may not include RNCMaskedView'); });

test('renders native backdrop blur without RNCMaskedView and ignores the tab safe area', async () => {
  const screen = await render(<BottomEdgeBlur tint="systemMaterialDark" />);
  expect(screen.getByTestId('bottom-native-host').props).toMatchObject({ ignoreSafeArea: 'all', pointerEvents: 'none', colorScheme: 'dark' });
  expect(screen.getByTestId('bottom-native-host')).toHaveStyle({ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 });
  expect(screen.getAllByTestId('bottom-native-rectangle')[0].props.modifiers[0].style)
    .toEqual({ type: 'material', material: 'ultraThin' });
  const mask = screen.getAllByTestId('bottom-native-rectangle')[1].props.modifiers[0].style;
  expect(mask.startPoint).toEqual({ x: 0, y: 0 });
  expect(mask.endPoint).toEqual({ x: 0, y: 1 });
  expect(mask.colors[0]).toBe('rgba(0,0,0,0)');
  expect(mask.colors.at(-1)).toBe('rgba(0,0,0,1)');
});
