import { ObjectAddress, ObjectAddressImpl } from "./vendor/address/index.js";
import { IndexMap } from "@console-one/collections";
import { SetMultimap } from "@console-one/multimap";
import { ObjectStream } from "./vendor/stream/index.js";
import { uuid } from "./vendor/stringutil.js";
import { Controller, DefaultController } from './controller.js'
import { ProcessConstants, ProcessEvent } from "./events.js";

export type ProcessBody = (controller: Controller) => ProcessRuntime;
export type ProcessRuntime = AsyncGenerator<any, any, any> & { id?: string };
export type ControllerInput = ((process?: DefaultProcess) => Controller) | Controller;

export type ExceptionBlockingRule<Configs = any> = {
  type: 'exceptionBlockingRule';
  block: boolean;
  configs?: Configs;
};

export const DefaultBlockingRule: ExceptionBlockingRule = {
  type: 'exceptionBlockingRule',
  block: false,
};


export type RetentionPolicy = {
  replayOnSubscribe?: boolean;
};

export const DefaultRetentionPolicy: RetentionPolicy = {
  replayOnSubscribe: true,
};


export interface Process {

  exceptionBlocking?: ExceptionBlockingRule;
  retention?: RetentionPolicy
  source?: ProcessRuntime

  done: boolean;
  running: boolean;
  id: ObjectAddress;

  maxSeq?: number 
  
  _emit(event: ProcessEvent): void
  _setSource(provided: ProcessBody): void 

  message(data: any): void
  subscribe(subscription: (close: () => void | any) => (event: any) => void | any , inputClause?: any): () => void | any
}

export class DefaultProcess implements Process {

  private subscriptions: IndexMap<any>;
  private subscriptionsByClause: SetMultimap<string, string | number>;

  private _source?: ProcessRuntime;
  private stateIndex: number;
  private states: ProcessEvent[];

  private doneNotified: boolean;
  private consumers: boolean;

  private activeSignals: Set<any>;
  private consumerIndex: number;
  private eventCount: number;

  private controller?: Controller;
  private getController: (process?: DefaultProcess) => Controller;
  private takeable: any[];

  public exceptionBlocking: ExceptionBlockingRule;
  public retention: RetentionPolicy
  public done: boolean;
  public running: boolean;
  public id: ObjectAddress;
  
  private set source(val: ProcessRuntime) {
    if (this.ready) throw new Error("Source can't be provided twice!");
    this._source = val;
    if (val.id !== undefined) {
      this.id.set("userSpace", { path: val.id });
    }
    this.process();
  }

  public get source(): ProcessRuntime {
    return this._source as any;
  }

  public get ready(): boolean {
    return this._source !== undefined;
  }

  public get runnable(): boolean {
    return this.ready && this.consumers && !this.running && !this.done;
  }

  constructor(opts: {
    id?: any;
    controller?: ControllerInput;
    source?: ProcessBody;
    exceptionBlocking?: ExceptionBlockingRule;
    retention?: RetentionPolicy;   // <-- new, optional
    logConfigs?: any
  } = {}) {
    this.subscriptions = new IndexMap<any>();
    this.subscriptionsByClause = new SetMultimap<string, string>();
    this.stateIndex = -1;
    this.consumerIndex = -1;
    this.states = [];
    this.done = false;
    this.doneNotified = false;
    this.consumers = false;
    this.running = false;
    this.id = new ObjectAddressImpl({ dim: 'processNum', path: uuid() });
    this.exceptionBlocking = opts.exceptionBlocking ?? DefaultBlockingRule;
    this.retention = opts.retention ?? DefaultRetentionPolicy;
    let controllerInput: ControllerInput =
      opts.controller ?? ((process) => new DefaultController({ process }));

    if (typeof controllerInput !== "function") {
      const fixedController = controllerInput;
      controllerInput = (process) => {
        if (fixedController instanceof DefaultController && process) {
          fixedController.attachProcess(process);
        }
        return fixedController;
      };
    }

    this.getController = controllerInput;
    this.takeable = [];
    this.eventCount = 0;
    this.activeSignals = new Set<string>();
    if (opts.source !== undefined) {
      this._setSource(opts.source);
    }
  }

  public _setSource(provided: ProcessBody) {
    if (this._source !== undefined) {
      throw new Error("Source can't be provided twice!");
    }
    this.controller = this.getController(this);
    this.source = provided(this.controller);
  }

  /**
   * Side-channel entry point: anything the controller emits comes here.
   */
  public _emit(event: ProcessEvent) {
    if (this.done) return;
    this.states.push(event);
    void this.moveConsumers();
  }

  /**
   * Core driver loop.
   *
   * - Only drives the generator.
   * - No event creation: all events come from controller.emit(...)
   * - Stops on:
   *   - generator done
   *   - or last event is Blocked (awaiting `message()` input)
   */
  private async process() {
    if (this.running || this.done) return;

    while (this.runnable) {
      this.running = true;
      const nextArg = this.takeable.length > 0 ? [this.takeable.shift()] : [];
      const ctrl = this.controller as Controller;

      let result: IteratorResult<any>;
      try {
        result = await this.source.next(nextArg);
      } catch (err) {
        ctrl.error(err);
        this.done = true;
        await this.moveConsumers();
        this.running = false;
        break;
      }

      const { done, value } = result;

      if (done) {
        let ev: ProcessEvent;
        if (ProcessEvent.describes(value) && value.op === ProcessConstants.Completed) {
          ev = { ...value, done: true };
        } else {
          ev = { ...ctrl.completed(value), done: true };
        }
        this.states.push(ev);
        this.done = true;
        this.controller?._shutdown();
        await this.moveConsumers();
        this.running = false;
        break;
      }

      this.running = false;

      const last = this.states[this.states.length - 1];
      if (last && last.op === ProcessConstants.Blocked && this.takeable.length === 0) {
        // Wait until someone calls message(...)
        break;
      }
    }
  }

  private async moveConsumers() {
    while (this.consumerIndex < this.states.length - 1) {
      this.consumerIndex++;
      const event = this.states[this.consumerIndex];
      const consumerIds = this.getConsumerIdsIn(
        ProcessConstants.All,
        event.op
      );

      for (const consumerID of consumerIds) {
        if (!this.subscriptions.has(consumerID)) continue;
        const consumer = this.subscriptions.get(consumerID);
        try {
          if (consumer.clause === ProcessConstants.All) {
            consumer.callback(event);
          } else {
            consumer.callback(event.data);
          }
        } catch (err) {
          console.error("Error in consumer callback", err);
        }
      }
    }

    if (this.done && !this.doneNotified) {
      this.doneNotified = true;
      const allIds = this.getConsumerIdsIn(
        ...this.subscriptionsByClause.keys()
      );
      for (const consumerID of allIds) {
        if (!this.subscriptions.has(consumerID)) continue;
        const consumer = this.subscriptions.get(consumerID);
        try {
          consumer.callback(null);
        } catch (err) {
          console.error("Error in terminal consumer callback", err);
        }
      }
    }
  }

  public message(item: any) {
    this.takeable.push(item);
    if (this.runnable) this.process();
  }

  public subscribe(subscription: any, inputClause?: any) {
    const lock = this.subscriptions.lock();
    let deleted = false;
    let setup = false;
    const clause: string = inputClause ?? ProcessConstants.All;

    // snapshot of how many events existed BEFORE this subscription
    const snapshotIndex = this.states.length;

    const close = () => {
      const wasDeleted = deleted;
      deleted = true;
      if (setup) {
        this.subscriptions.delete(lock);

        // remove from clause multimap
        const clauseSet = this.subscriptionsByClause.get(clause);
        clauseSet.delete(lock);
        if (clauseSet.size === 0) {
          this.subscriptionsByClause.delete(clause);
          this.deactivateClause(clause);
        }
      }
      return deleted !== wasDeleted;
    };

    const callback = subscription(close);
    if (!deleted) {
      this.subscriptions.set(lock, {
        clause,
        subscribeState: this.stateIndex,
        callback,
        close,
      });

      // register in clause multimap
      this.subscriptionsByClause.set(clause, lock);

      // First subscriber for this clause?
      if (this.subscriptionsByClause.count(clause) === 1) {
        this.activateClause(clause);
      }

      setup = true;

      // --- NEW: retention replay -------------------------------------------
      if (this.retention.replayOnSubscribe) {
        this.replayForSubscriber(lock, snapshotIndex);
      }
      // ---------------------------------------------------------------------

      // If process is runnable, (re)start driving the generator
      if (this.runnable) this.process();

      // 🔴 NEW: if process is already done, still send terminal null to this subscriber
      if (this.done) {
        try {
          callback(null);
        } catch (err) {
          console.error("Error in terminal consumer callback (late)", err);
        }
      }

    }
    return close;
  }
  private deactivateClause(clause: string) {
    if (!this.activeSignals.has(clause)) return false;
    this.activeSignals.delete(clause);
    // any active clause means we have consumers
    this.consumers = this.activeSignals.size > 0;
    return true;
  }
  
  private activateClause(clause: string) {
    this.activeSignals.add(clause);
    // any active clause means we have consumers
    this.consumers = this.activeSignals.size > 0;
  }
  

  private getConsumerIdsIn(...clauses: string[]): Set<string | number> {
    const all = new Set<string | number>();
    for (const item of clauses) {
      for (const subID of this.subscriptionsByClause.get(item)) {
        all.add(subID);
      }
    }
    return all;
  }

  public toObjectStream(): ObjectStream<any, any> {
    const stream = new ObjectStream<any, any>();

    const close = this.subscribe((_closeProc: () => boolean) => (ev: any) => {
      if (ev === null) {
        if ((stream as any).publish) {
          (stream as any).publish(null);
        } else if ((stream as any).next) {
          (stream as any).next(null);
        }
        return true;
      }

      if (!ev || ev.type !== 'processevent') return false;

      const push =
        (stream as any).publish?.bind(stream) ||
        (stream as any).next?.bind(stream);

      if (!push) return false;

      switch (ev.op) {
        case ProcessConstants.Data:
          push({ type: 'data', payload: ev.data });
          break;
        case ProcessConstants.Logs:
          push({ type: 'log', payload: ev.data });
          break;
        case ProcessConstants.Blocked:
          push({ type: 'blocked', payload: ev.data });
          break;
        default:
          break;
      }

      return false;
    }, ProcessConstants.All);

    if (typeof (stream as any).onCancel === "function") {
      (stream as any).onCancel(() => close());
    }

    return stream;
  }

  private replayForSubscriber(subId: string | number, upToExclusive: number) {
    if (!this.subscriptions.has(subId)) return;
    const sub = this.subscriptions.get(subId);
    const clause = sub.clause as string;

    const limit = Math.min(upToExclusive, this.states.length);

    for (let i = 0; i < limit; i++) {
      const event = this.states[i];

      try {
        if (clause === ProcessConstants.All) {
          // same semantics as moveConsumers for clause "all"
          sub.callback(event);
        } else if (event.op === clause) {
          // same semantics as moveConsumers for specific clause
          sub.callback(event.data);
        }
      } catch (err) {
        console.error("Error in consumer callback (replay)", err);
      }
    }
  }
}


const anyIntersect = (candidates: Set<any>, within: Set<any>) => {
  for (const candidate of candidates) {
    if (within.has(candidate)) return true;
  }
  return false;
};