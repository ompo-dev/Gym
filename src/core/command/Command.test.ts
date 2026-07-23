import { CompositeCommand, type Command } from './Command';

function spy(label: string, log: string[], failOnExecute = false): Command {
  return {
    label,
    execute: async () => {
      if (failOnExecute) throw new Error(`${label} falhou`);
      log.push(`do:${label}`);
    },
    undo: async () => void log.push(`undo:${label}`),
  };
}

test('runs children in order', () => {
  const log: string[] = [];
  return new CompositeCommand('Plano', [spy('a', log), spy('b', log), spy('c', log)])
    .execute()
    .then(() => expect(log).toEqual(['do:a', 'do:b', 'do:c']));
});

test('undo reverses, so the last thing written is the first taken back', async () => {
  const log: string[] = [];
  const cmd = new CompositeCommand('Plano', [spy('a', log), spy('b', log)]);
  await cmd.execute();
  log.length = 0;

  await cmd.undo();

  expect(log).toEqual(['undo:b', 'undo:a']);
});

test('a failing child rolls back the ones that already ran', async () => {
  // Half a plan is worse than none: the bus only stacks a command after execute
  // resolves, so on failure there would be no undo left to clean up.
  const log: string[] = [];
  const cmd = new CompositeCommand('Plano', [
    spy('a', log),
    spy('b', log),
    spy('boom', log, true),
    spy('never', log),
  ]);

  await expect(cmd.execute()).rejects.toThrow('boom falhou');
  expect(log).toEqual(['do:a', 'do:b', 'undo:b', 'undo:a']);
});

test('a child that fails to roll back does not hide the original error', async () => {
  const log: string[] = [];
  const stubborn: Command = {
    label: 'stubborn',
    execute: async () => void log.push('do:stubborn'),
    undo: async () => {
      throw new Error('undo tambem falhou');
    },
  };
  const cmd = new CompositeCommand('Plano', [stubborn, spy('boom', log, true)]);

  await expect(cmd.execute()).rejects.toThrow('boom falhou');
});

test('an empty composite is a no-op, not a crash', async () => {
  const cmd = new CompositeCommand('Vazio', []);
  await expect(cmd.execute()).resolves.toBeUndefined();
  await expect(cmd.undo()).resolves.toBeUndefined();
});
