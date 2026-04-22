// process.test.ts
import {
  Process,
  ProcessConstants,
  ProcessEvent,
  DefaultController,
  type Controller,
  type RetentionPolicy,
  DefaultProcess,
} from "../index.js"; // adjust path


const anyIntersect = (candidates: Set<any>, within: Set<any>) => {
  for (const candidate of candidates) {
    if (within.has(candidate)) return true;
  }
  return false;
};

const isSubset = (candidates: Set<any>, within: Set<any>) => {
  for (const candidate of candidates) {
    if (!within.has(candidate)) return false;
  }
  return true;
};

// --- small helper so we can wait for process completion in tests -----------
function waitForProcessDone(proc: Process) {
  return new Promise<void>((resolve) => {
    proc.subscribe(() => (ev: any) => {
      if (ev === null) {
        resolve();
        return true;
      }
      return false;
    }, ProcessConstants.All);
  });
}

describe("helpers", () => {
  test("anyIntersect returns true when sets share at least one element", () => {
    const a = new Set(["a", "b"]);
    const b = new Set(["b", "c"]);
    const c = new Set(["x", "y"]);

    expect(anyIntersect(a, b)).toBe(true);
    expect(anyIntersect(b, a)).toBe(true);
    expect(anyIntersect(a, c)).toBe(false);
  });

  test("isSubset returns true when all candidates are in 'within'", () => {
    const candidates = new Set(["a", "b"]);
    const within = new Set(["a", "b", "c"]);

    expect(isSubset(candidates, within)).toBe(true);
    expect(isSubset(new Set(["a", "x"]), within)).toBe(false);
  });
});

describe("ProcessEvent", () => {
  test("create builds a proper process event without optional fields", () => {
    const ev = ProcessEvent.create("opName");
    expect(ev).toEqual({
      type: "processevent",
      op: "opName",
    });
  });

  test("create includes data and done when provided", () => {
    const ev = ProcessEvent.create("opName", { data: 123, done: true });
    expect(ev).toEqual({
      type: "processevent",
      op: "opName",
      data: 123,
      done: true,
    });
  });

  test("describes correctly type-guards processevents", () => {
    const ev = ProcessEvent.create("x");
    expect(ProcessEvent.describes(ev)).toBe(true);
    expect(
      ProcessEvent.describes({ type: "processevent", op: 123 })
    ).toBe(false);

    expect(ProcessEvent.describes({})).toBe(false);
    expect(ProcessEvent.describes(null)).toBe(false);
  });
});

describe("DefaultController", () => {
  test("event uses amendmentMaker and does not emit automatically", () => {
    const emitted: any[] = [];
    const fakeProcess = {
      _emit: (ev: any) => emitted.push(ev),
    } as any;

    const ctrl = new DefaultController({
      process: fakeProcess,
      amendmentMaker: (ev) => ({
        ...ev,
        op: `patched:${ev.op}`,
      }),
    });

    const ev = ctrl.event("foo", { data: 42 });
    expect(ev.op).toBe("patched:foo");
    expect(ev.data).toBe(42);

    // event() itself does not emit
    expect(emitted).toHaveLength(0);
  });
});

describe("Process core behavior", () => {
  const makeSimpleProcess = (events: any[] = []) =>
    async function* (ctrl: Controller) {
      ctrl.log("start");
      ctrl.data({ step: 1 });
      ctrl.data({ step: 2 });
      events.push("generator-run");
      return "result";
    };

  test("process runs source and publishes events to ALL clause subscribers", async () => {
    const seen: any[] = [];

    const proc = new DefaultProcess({
      source: makeSimpleProcess(),
    });

    const done = new Promise<void>((resolve) => {
      proc.subscribe(() => (ev: any) => {
        if (ev === null) {
          resolve();
          return true;
        }
        if (ev.type === "processevent") {
          seen.push(ev);
        }
        return false;
      }, ProcessConstants.All);
    });

    await done;

    const ops = seen.map((ev) => ev.op);
    expect(ops).toContain(ProcessConstants.Logs);
    expect(ops).toContain(ProcessConstants.Data);
    expect(ops).toContain(ProcessConstants.Completed);

    const completedEvents = seen.filter(
      (ev) => ev.op === ProcessConstants.Completed
    );
    expect(completedEvents).toHaveLength(1);
    expect(completedEvents[0].data).toBe("result");
  });

  test("subscribers on Data clause see only data payloads", async () => {
    const payloads: any[] = [];

    const proc = new DefaultProcess({
      source: makeSimpleProcess(),
    });

    const done = new Promise<void>((resolve) => {
      proc.subscribe(() => (data: any) => {
        if (data === null) {
          resolve();
          return true;
        }
        payloads.push(data);
        return false;
      }, ProcessConstants.Data);
    });

    await done;

    // Only two data events
    expect(payloads).toEqual([{ step: 1 }, { step: 2 }]);
  });

  test("error in generator is converted into error event and terminal null", async () => {
    const seen: any[] = [];

    const proc = new DefaultProcess({
      source: async function* (ctrl: Controller) {
        ctrl.log("before error");
        throw new Error("boom");
      },
    });

    const done = new Promise<void>((resolve) => {
      proc.subscribe(() => (ev: any) => {
        if (ev === null) {
          resolve();
          return true;
        }
        seen.push(ev);
        return false;
      }, ProcessConstants.All);
    });

    await done;

    const ops = seen.map((ev) => ev.op);
    expect(ops).toContain(ProcessConstants.Error);
    expect(ops).not.toContain(ProcessConstants.Completed);

    const errorEvents = seen.filter(
      (ev) => ev.op === ProcessConstants.Error
    );
    expect(errorEvents[0].data).toBeInstanceOf(Error);
  });

  test("block + message pattern resumes generator", async () => {
    const dataPayloads: any[] = [];

    const proc = new DefaultProcess({
      source: async function* (ctrl: Controller) {
        
        const [msg] = yield ctrl.block("waiting");
        ctrl.data({ msg });
        return "done";
      },
    });

    const done = new Promise<void>((resolve) => {
      proc.subscribe(() => (ev: any) => {
        if (ev === null) {
          resolve();
          return true;
        }
        if (ev.type === "processevent" && ev.op === ProcessConstants.Data) {
          dataPayloads.push(ev.data);
        }
        return false;
      }, ProcessConstants.All);
    });

    // At this point generator should be blocked.
    // Send a message to resume it:
    proc.message("hello");

    await done;

    expect(dataPayloads).toEqual([{ msg: "hello" }]);
  });
});

describe("Process retention / replay", () => {
  test("late subscriber gets replay of previous events when retention.replayOnSubscribe is true (default)", async () => {
    const earlyEvents: any[] = [];
    const lateEvents: any[] = [];

    const proc = new DefaultProcess({
      source: async function* (ctrl: Controller) {
        ctrl.log("log-1");
        ctrl.data("data-1");
        ctrl.data("data-2");
        return "done";
      },
      // default retention is replayOnSubscribe: true
    });

    // Early subscriber: starts the process and sees events in real-time
    const earlyDone = new Promise<void>((resolve) => {
      proc.subscribe(() => (ev: any) => {
        if (ev === null) {
          resolve();
          return true;
        }
        earlyEvents.push(ev);
        return false;
      }, ProcessConstants.All);
    });

    await earlyDone;

    // Now we subscribe LATE: process is already done, states[] is full.
    const lateDone = new Promise<void>((resolve) => {
      proc.subscribe(() => (ev: any) => {
        if (ev === null) {
          resolve();
          return true;
        }
        lateEvents.push(ev);
        return false;
      }, ProcessConstants.All);
    });

    await lateDone;

    // Late subscriber should have received a replay of the same events
    const earlyOps = earlyEvents
      .filter((ev) => ev && ev.type === "processevent")
      .map((ev) => ev.op);
    const lateOps = lateEvents
      .filter((ev) => ev && ev.type === "processevent")
      .map((ev) => ev.op);

    expect(lateOps).toEqual(earlyOps);
  });

  test("late subscriber on Data clause replays only data payloads", async () => {
    const latePayloads: any[] = [];

    const proc = new DefaultProcess({
      source: async function* (ctrl: Controller) {
        ctrl.log("log-1");
        ctrl.data("data-1");
        ctrl.data("data-2");
        return "done";
      },
    });

    // First subscriber just to drive the process
    await new Promise<void>((resolve) => {
      proc.subscribe(() => (ev: any) => {
        if (ev === null) {
          resolve();
          return true;
        }
        return false;
      }, ProcessConstants.All);
    });

    // Late subscriber on Data clause should see replayed data payloads
    const lateDone = new Promise<void>((resolve) => {
      proc.subscribe(() => (payload: any) => {
        if (payload === null) {
          resolve();
          return true;
        }
        latePayloads.push(payload);
        return false;
      }, ProcessConstants.Data);
    });

    await lateDone;

    expect(latePayloads).toEqual(["data-1", "data-2"]);
  });

  test("retention can be disabled via opts.retention.replayOnSubscribe = false", async () => {
    const lateEvents: any[] = [];

    const proc = new DefaultProcess({
      source: async function* (ctrl: Controller) {
        ctrl.log("log-1");
        ctrl.data("data-1");
        return "done";
      },
      retention: { replayOnSubscribe: false },
    });

    // Early subscriber drives process
    await new Promise<void>((resolve) => {
      proc.subscribe(() => (ev: any) => {
        if (ev === null) {
          resolve();
          return true;
        }
        return false;
      }, ProcessConstants.All);
    });

    // Late subscriber should NOT get historical events, only terminal null
    const lateDone = new Promise<void>((resolve) => {
      proc.subscribe(() => (ev: any) => {
        if (ev === null) {
          resolve();
          return true;
        }
        lateEvents.push(ev);
        return false;
      }, ProcessConstants.All);
    });

    await lateDone;

    expect(lateEvents).toHaveLength(0);
  });

  test("late subscriber still gets terminal null even when retention is disabled", async () => {
    const terminalSeen: any[] = [];

    const proc = new DefaultProcess({
      source: async function* (ctrl: Controller) {
        ctrl.data("x");
        return "done";
      },
      retention: { replayOnSubscribe: false },
    });

    // Drive process to completion
    await waitForProcessDone(proc);

    // Subscribe late
    await new Promise<void>((resolve) => {
      proc.subscribe(() => (ev: any) => {
        terminalSeen.push(ev);
        if (ev === null) {
          resolve();
          return true;
        }
        return false;
      }, ProcessConstants.All);
    });

    // Should have seen exactly one terminal null
    expect(terminalSeen).toEqual([null]);
  });
});
