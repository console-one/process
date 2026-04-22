/**
 * Smoke test for @console-one/process.
 *
 * Constructs a ProcessFactory from a plain method, runs the resulting
 * Process to completion, and verifies a Completed event carries the
 * return value. Covers the headline path: factory → exec → subscribe →
 * event stream → completion.
 */

import {
  ProcessFactory,
  ProcessFactoryFactory,
  ProcessConstants,
} from './index.js';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`SMOKE FAIL: ${msg}`);
    process.exit(1);
  }
}

async function main() {
  const factory = new ProcessFactoryFactory('smoke');

  // Method that returns its base + 1
  const procDef = factory.fromMethod((state: any) => state.base + 1);
  assert(procDef instanceof ProcessFactory, '[1/3] fromMethod returns a ProcessFactory');
  console.log('[1/3] factory.fromMethod built ProcessFactory');

  // Execute with input
  const proc = procDef.exec({ input: { base: 41 } });
  assert(proc && typeof proc.subscribe === 'function', '[2/3] exec returns a subscribable Process');
  console.log('[2/3] ProcessFactory.exec produced a Process');

  // Subscribe for the Completed event
  const completions: unknown[] = [];
  await new Promise<void>((resolve) => {
    proc.subscribe(() => (payload: unknown) => {
      if (payload === null) {
        resolve();
        return;
      }
      completions.push(payload);
    }, ProcessConstants.Completed);
  });

  assert(completions.length === 1, '[3/3] exactly one Completed payload observed');
  assert(completions[0] === 42, '[3/3] Completed payload is 41+1 = 42');
  console.log('[3/3] Process completed with value', completions[0]);

  console.log('\n✓ @console-one/process smoke test passed');
}

main().catch((err) => {
  console.error('SMOKE FAIL:', err);
  process.exit(1);
});
