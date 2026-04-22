# @console-one/process

Typed, event-emitting, subscribable long-running computations. Processes are addressable, controllable (pause / resume / cancel / seek), and compose via factories.

```ts
import {
  ProcessFactoryFactory,
  ProcessConstants,
} from '@console-one/process';

const factory = new ProcessFactoryFactory('my-namespace');

const proc = factory.fromMethod((state) => state.base + 1).exec({ input: { base: 41 } });

proc.subscribe(() => (payload) => {
  console.log('completed with', payload); // 42
  return true; // stop
}, ProcessConstants.Completed);
```

## What you get

- **`Process`** — the long-running computation. Emits typed events, supports subscribers with tag/predicate filters, tracks retention of past events for late subscribers.
- **`ProcessFactory` / `ProcessFactoryFactory`** — build Process constructors from a plain method (`fromMethod`) or an async generator (`fromGenerator`).
- **`Controller` / `DefaultController`** — owns process state, exposes hooks the process body calls to advance (`completed`, `failed`, `error`, signals).
- **`ProcessEvent` / `ProcessConstants`** — the event vocabulary: `Completed`, `Failed`, `Error`, plus the terminal / consumer-activation sets.
- **Retention policy** — `DefaultRetentionPolicy` caps the replay buffer; late subscribers get the retained tail.

## Install

```bash
npm install @console-one/process
```

Runtime deps:

- `@console-one/multimap` — ListMultimap / SetMultimap for subscriber indexes
- `@console-one/collections` — IndexMap for subscription bookkeeping

## Smoke test

```bash
npm run smoke
```

Builds a factory, runs a method through it, subscribes to `Completed`, confirms the right value flows out.

## Status and provenance

v0.1 — extracted from `lens-desktop/src/shared/process/` with the accompanying address subsystem, ObjectStream, and a `uuid` helper vendored into `src/vendor/` pending their own extractions (follow-up tasks).

### Intentionally dropped

| Origin file | Why |
|---|---|
| `types.ts` | App-specific type definitions; consumers should bring their own or define at the call site |
| `agentConfig.ts` | Agent-specific configuration that belongs in a downstream package |

### Vendored

| Dep | Location | Future |
|---|---|---|
| `ObjectAddress` + address subsystem (10 files, ~774 LOC) | `src/vendor/address/` | Promote to `@console-one/address` when a second consumer emerges |
| `ObjectStream` + `AbstractSubscribable` | `src/vendor/stream/` | Promote to `@console-one/stream` if needed |
| `uuid` (2-line fn) | `src/vendor/stringutil.ts` | Keep vendored — too small to extract |

### Substituted

| Origin import | Public package |
|---|---|
| `../multimap/set` | `@console-one/multimap` |
| `../indexmap` | `@console-one/collections` |

## License

MIT
