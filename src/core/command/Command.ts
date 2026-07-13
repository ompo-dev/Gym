/** A reversible user action. Add/Delete implement this; the bus keeps an undo stack. */
export interface Command {
  readonly label: string;
  execute(): Promise<void>;
  undo(): Promise<void>;
}
