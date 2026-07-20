import { muscleGroupOf } from './muscles';

test('classifies the common strength exercises in pt-BR', () => {
  expect(muscleGroupOf('Supino reto')).toBe('chest');
  expect(muscleGroupOf('Remada curvada')).toBe('back');
  expect(muscleGroupOf('Agachamento livre')).toBe('legs');
  expect(muscleGroupOf('Leg press')).toBe('legs');
  expect(muscleGroupOf('Desenvolvimento halter')).toBe('shoulders');
  expect(muscleGroupOf('Rosca direta')).toBe('biceps');
  expect(muscleGroupOf('Triceps testa')).toBe('triceps');
  expect(muscleGroupOf('Prancha')).toBe('core');
  expect(muscleGroupOf('Panturrilha em pe')).toBe('calves');
  expect(muscleGroupOf('Elevacao pelvica')).toBe('glutes');
});

test('classifies the common strength exercises in en-US', () => {
  expect(muscleGroupOf('Bench press')).toBe('chest');
  expect(muscleGroupOf('Barbell row')).toBe('back');
  expect(muscleGroupOf('Back squat')).toBe('legs');
  expect(muscleGroupOf('Overhead press')).toBe('shoulders');
  expect(muscleGroupOf('Hammer curl')).toBe('biceps');
  expect(muscleGroupOf('Hip thrust')).toBe('glutes');
});

test('accents do not change the classification', () => {
  // The table is written unaccented; input rarely is.
  expect(muscleGroupOf('Abdômen')).toBe('core');
  expect(muscleGroupOf('Elevação lateral')).toBe('shoulders');
  expect(muscleGroupOf('Tríceps francês')).toBe('triceps');
  expect(muscleGroupOf('Panturrilha')).toBe('calves');
});

test('cardio wins over a muscle keyword in the same name', () => {
  // "corrida na esteira" would otherwise be caught by nothing, but
  // "bicicleta para perna" must not land in legs.
  expect(muscleGroupOf('Corrida na esteira')).toBe('cardio');
  expect(muscleGroupOf('Bicicleta')).toBe('cardio');
  expect(muscleGroupOf('Remo ergometro')).toBe('cardio');
});

test('rowing machine is cardio but a barbell row is back', () => {
  expect(muscleGroupOf('Remo ergometro')).toBe('cardio');
  expect(muscleGroupOf('Remada baixa')).toBe('back');
});

test('arm isolation is not swallowed by chest or back rules', () => {
  // "pulley triceps" contains no chest word, but ordering matters for names
  // that mention a press.
  expect(muscleGroupOf('Pulley triceps')).toBe('triceps');
  expect(muscleGroupOf('Rosca scott')).toBe('biceps');
});

test('unknown exercises fall into other instead of being guessed', () => {
  expect(muscleGroupOf('Exercicio inventado')).toBe('other');
  expect(muscleGroupOf('')).toBe('other');
  expect(muscleGroupOf('   ')).toBe('other');
});
