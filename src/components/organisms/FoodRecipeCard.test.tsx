import { fireEvent, render } from '@testing-library/react-native';

import { foodRecipeSchema } from '@/domains/schemas';
import { FoodRecipeCard } from './FoodRecipeCard';

jest.mock('@/data/PantryRepository', () => ({ PantryRepository: { all: async () => [] } }));
jest.mock('@/components/atoms/GlassSurface', () => ({ GlassSurface: require('react-native').View }));

test('ingredients can be checked, saved, and unchecked after reopening', async () => {
  const recipe = foodRecipeSchema.parse({ servings: 1, ingredients: [{ label: 'banana', quantity: 1, unit: 'unidade' }], steps: [{ text: 'Misture.' }] });
  const onChange = jest.fn(async () => {});
  const screen = await render(<FoodRecipeCard recipe={recipe} onChange={onChange} />);
  expect(screen.getByRole('checkbox').props.accessibilityState.checked).toBe(false);
  await fireEvent.press(screen.getByRole('checkbox'));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ ingredients: [expect.objectContaining({ available: true })] }));
  const saved = foodRecipeSchema.parse(JSON.parse(JSON.stringify(onChange.mock.calls[0][0])));
  await screen.rerender(<FoodRecipeCard recipe={saved} onChange={onChange} />);
  expect(screen.getByRole('checkbox').props.accessibilityState.checked).toBe(true);
  await fireEvent.press(screen.getByRole('checkbox'));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ ingredients: [expect.objectContaining({ available: false })] }));
});
