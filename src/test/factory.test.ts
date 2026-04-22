/**
 * These tests assert:
 * - fromMethod() wraps a sync/async function into a Process that emits
 *   a Completed event with its return value.
 * - fromGenerator() produces a Process whose events get a procID injected
 *   via ProcedureFactory's amendmentMaker.
 */

import { ProcessFactory, ProcessFactoryFactory } from './../factory';
import { ProcessConstants } from './../index';

describe('ProcedureFactory.fromMethod', () => {
  test('wraps a function and completes with its return value', async () => {
    const factory = new ProcessFactoryFactory('test-factory');

    // fn takes the controller state as argument and returns a value
    const procDef = factory.fromMethod((state: any) => {
      state.called = true;
      return state.base + 1;
    });

    const input = { base: 41 };
    const process = procDef.exec({ input });

    const completions: any[] = [];

    const done = new Promise<void>((resolve) => {
      // Subscribe to 'completed' clause: receives event.data only
      process.subscribe(() => (dataOrNull: any) => {
        if (dataOrNull === null) {
          resolve();
          return;
        }
        completions.push(dataOrNull);
      }, ProcessConstants.Completed);
    });

    await done;

    // ctrl.completed(42) -> completed clause receives `42`
    expect(completions).toEqual([42]);
  });
});

describe('ProcedureFactory.fromGenerator', () => {
  test('injects procID into events from the generated Process', async () => {
    const factory = new ProcessFactoryFactory('chatproc');

    // ProcessBody: (ctrl) => AsyncGenerator
    const procDef = factory.fromGenerator(
      async function* (ctrl) {
        // Should be amended with procID
        ctrl.log('hello');

        // Completed should also be amended with procID
        ctrl.completed({ ok: true });
        return;
      }
    );

    const process = procDef.exec({ input: { foo: 'bar' } });

    const events: any[] = [];

    const done = new Promise<void>((resolve) => {
      // '*' clause gets the full ProcessEvent (with procID)
      process.subscribe(() => (eventOrNull: any) => {
        if (eventOrNull === null) {
          resolve();
          return;
        }
        events.push(eventOrNull);
      }, ProcessConstants.All);
    });

    await done;

    expect(events.length).toBeGreaterThanOrEqual(1);

    // Each event should have a procID that starts with the factory id.
    for (const ev of events) {
      expect(ev).toHaveProperty('procID');
      expect(ev.procID).toMatch(/^chatproc\//);
    }
  });
});
