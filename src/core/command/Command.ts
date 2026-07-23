/** A reversible user action. The bus keeps an undo stack of these. */
export interface Command {
  readonly label: string;
  execute(): Promise<void>;
  undo(): Promise<void>;
}

/**
 * N actions, one undo. A week-long plan would otherwise stack seven commands
 * and cost seven taps to take back; as a composite it holds a single slot in
 * the bus's undo stack and leaves whole.
 *
 * Serial on purpose: the order is observable — entries appear in the order the
 * caller asked for — and rollback stays simple only while we know exactly which
 * children already ran.
 */
export class CompositeCommand implements Command {
  constructor(
    readonly label: string,
    private readonly children: readonly Command[],
  ) {}

  async execute(): Promise<void> {
    const done: Command[] = [];
    try {
      for (const child of this.children) {
        await child.execute();
        done.push(child);
      }
    } catch (error) {
      // Half a plan is worse than none: the user would see three of seven days
      // with no idea which failed, and the bus stacks nothing on failure
      // (`run` only pushes after `execute` resolves), so no undo would exist
      // to clean it up.
      for (const child of done.reverse()) {
        // Best effort — the error worth surfacing is the original one below.
        await child.undo().catch(() => {});
      }
      throw error;
    }
  }

  async undo(): Promise<void> {
    for (const child of [...this.children].reverse()) await child.undo();
  }
}
