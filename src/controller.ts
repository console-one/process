
// -----------------------------------------------------------------------------
// Controller
// -----------------------------------------------------------------------------

import { ProcessConstants, ProcessEvent } from "./events.js";
import { DefaultProcess } from "./process.js";

/**
 * The object injected into a process that allows it to format outputs for the outside 
 * world and otherwise communicate with it in ways unsupported by its base generator implementation. 
 */
export type Controller<State = any> = {
  state: State;
  /**
   * Emit logs from the process.
   */
  log(...data: any[]): ProcessEvent;
  /**
   * Emit data from the process - for streaming.
   */
  data(payload: any): ProcessEvent;
  /**
   * Format the returned value. Maybe can deprecate. 
   */
  completed(data?: any): ProcessEvent;
  /**
   * Format a returned error. Used for when we want to signal 
   * an error through a more elaborate structure than a thrown Error event. 
   */
  error(err?: any): ProcessEvent;
  /**
   * Format a blocker to return through yield. Not strictly necessary. May deprecate.  
   */
  block(term: any): ProcessEvent;
  /**
   * Not widely implemented but to be used when we want to generate a new process from within a 
   * process and push down stack configurations. 
   */
  forkOn(
    handler: (controller: Controller) => AsyncGenerator<any, any, any>,
    fields?: any
  ): ProcessEvent;
  /**
   * Access the outer profile of the process from within its implementation. Essentially like 
   * getting the public interface of a class by accessing the prototype. 
   */
  getProcess(): Promise<DefaultProcess>
  /**
   * Used in debug mode. Emit all control events to the console. 
   */
  logAsap(): void
  /**
   * Used by the process where the controller is injected to launch errors to clients
   * on teardown. 
   */
  _shutdown(): void
};

/**
 * Input arguments for the default controller. 
 */
export type DefaultControllerOpts<State = any> = {
  /**
   * The process this controller is running for. Optional because
   * it can be set later in the case the factory generating a process
   * needs to create the process with a controller in hand. 
   */ 
  process?: DefaultProcess;
  /**
   * The custom data to inject into the process - the arguments it runs with.
   */ 
  amendmentMaker?: (ev: ProcessEvent) => ProcessEvent;
  /**
   * The custom data to inject into the process - the arguments it runs with.
   */ 
  state?: State;
};

/**
 * Standard implementation of the controller interface. 
 */
export class DefaultController<State = any> implements Controller<State> {
  public state: State;

  private amendmentMaker: (ev: ProcessEvent) => ProcessEvent;
  private onProcessResolver?: { resolve: any, reject: any };

  private resolvedProcess?: Promise<DefaultProcess>
  private process?: DefaultProcess;
  private isShutdown?: boolean
  private debug?: boolean 

  constructor(opts: DefaultControllerOpts<State> = {}) {
    this.state = (opts.state ?? {}) as State;
    this.amendmentMaker = opts.amendmentMaker ?? ((ev) => ev);
    if (opts.process !== undefined) this.attachProcess(opts.process);
    this.isShutdown = false;
    this.debug = false;
  }

  logAsap() {
    this.debug = true; 
  }

  getProcess() {
    if (this.resolvedProcess === undefined) {
      if (this.process === undefined) {
        this.resolvedProcess = new Promise((resolve, reject) => {
          this.onProcessResolver = { resolve, reject }
        })
      } else {
        this.resolvedProcess = Promise.resolve(this.process)
      }
    }
    return this.resolvedProcess;
  }

  attachProcess(process: DefaultProcess) {
    this.process = process;
    if (this.onProcessResolver !== undefined) {
      this.onProcessResolver.resolve(process)
    }
  }

  event(op: string, opts: { data?: any; done?: boolean } = {}): ProcessEvent {
    const ev: ProcessEvent = {
      type: 'processevent',
      op,
      ...(opts.data !== undefined ? { data: opts.data } : {}),
      ...(opts.done !== undefined ? { done: opts.done } : {}),
    };
    return this.amendmentMaker(ev);
  }

  // ---- side-channel only ----------------------------------------------------

  private emit(ev) {
    // if (this.debug) console.log("Process " + this.process?.id?.toString() + " event emitted: ", ev )
    this.process?._emit(ev);
  }

  log(...data: any[]): ProcessEvent {
    const ev = this.event(ProcessConstants.Logs, { data });
    this.emit(ev); 
    return ev;
  }

  data(payload: any): ProcessEvent {
    const ev = this.event(ProcessConstants.Data, { data: payload });
    this.emit(ev); 
    return ev;
  }

  // ---- control / terminal ---------------------------------------------------

  completed(data?: any): ProcessEvent {
    const ev = this.event(
      ProcessConstants.Completed,
      data !== undefined ? { data } : {}
    );
    // if (this.debug) console.log("Process " + this.process?.id?.toString() + " complete emitted: ", ev )
    return ev;
  }

  error(err?: any): ProcessEvent {
    const ev = this.event(
      ProcessConstants.Error,
      err !== undefined ? { data: err } : {}
    );
    this.emit(ev); 
    return ev;
  }

  block(term: any): ProcessEvent {
    const ev = this.event(ProcessConstants.Blocked, { data: term });
    this.emit(ev)
    return ev;
  }

  forkOn(
    handler: (controller: Controller) => AsyncGenerator<any, any, any>,
    fields?: any
  ): ProcessEvent {
    const data = fields !== undefined ? { handler, fields } : { handler };
    const ev = this.event(ProcessConstants.Fork, { data });
    this.emit(ev); 
    return ev;
  }

  _shutdown() {
    let wasShutdown = this.isShutdown;
    this.isShutdown = true;
    if (!wasShutdown && this.onProcessResolver !== undefined && this.process === undefined) {
      this.onProcessResolver.resolve(null)
    }
  }
}