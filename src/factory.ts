import { Address, ObjectAddress, ObjectAddressImpl } from "@console-one/address";
import { uuid } from "./vendor/stringutil.js";
import { Controller, DefaultController } from "./controller.js";
import {
  DefaultProcess,
  Process,
  ProcessBody
} from "./process.js";


/**
 * A process-factory. Very close in structure to a procedure in our other dialects. 
 */
export class ProcessFactory {
  id: ObjectAddress;
  input?: any;
  output?: any;
  exec: (item: { input: any }) => Process;

  constructor(state: {
    input?: any;
    output?: any;
    id: Address;
    exec: (args: { input: any }) => Process;
  }) {
    if (state.input !== undefined) this.input = state.input;
    if (state.output !== undefined) this.output = state.output;
    this.id = new ObjectAddressImpl([
      { dim: "procedureNum", path: uuid() },
      state.id,
    ]);
    this.exec = state.exec;
  }
}

/**
 * A general description of how we would use this to integrate process factories with types. 
 * 
 * On initial execution - generate the process. If inputs fail type guards - emit the errors
 * as blockers and accept patches to the state until type rules pass. This would enable 
 * the execution of connector setup workflows. 
 */
export const typedProcessFactory = (
  schema: { getErrors(state: any): any[] },
  applyPatch: (state: any, patch: any) => any
): DefaultProcess => {
  return new DefaultProcess({
    source: async function* input(ctrl: Controller) {
      let errors = schema.getErrors(ctrl.state);
      while (errors.length > 0) {
        const blockPayload = {
          type: "validation-block",
          errors,
          state: ctrl.state,
        };
        // Emit blocker + view of state
        ctrl.block(blockPayload);
        // Wait for unblock input: process.message([updateEvent])
        const [updateEvent] = (yield) as [any];
        if (!updateEvent) {
          ctrl.error(new Error("Blocked but no update provided"));
          return;
        }
        if (updateEvent.type === "replace-state") ctrl.state = updateEvent.state;
        else ctrl.state = applyPatch(ctrl.state, updateEvent);
        errors = schema.getErrors(ctrl.state);
      }

      ctrl.completed(ctrl.state);
      return;
    },
  });
};

export class ProcessFactoryFactory  {

  inc: number;
  controllerProvider: (state?: any) => (process?: DefaultProcess) => Controller;

  constructor(public id: string = uuid()) {
    this.inc = 0;
    this.controllerProvider =
      (state?: any) =>
      (process?: DefaultProcess): Controller =>
        new DefaultController({
          process,
          state,
          amendmentMaker: (ev) => ({
            procID: this.id + "/" + this.count(),
            // '0' to be replaced by a counter on the process when we eventually do sequence number preservation
            seq: 0 + this.count(),
            ...ev,
          }),
        });
  }

  count() {
    const num = this.inc;
    this.inc += 1;
    return num;
  }

  fromGenerator(
    opts: { input?: any; output?: any; id?: Address; exec: ProcessBody } | ProcessBody
  ): ProcessFactory {
    const fn: ProcessBody =
      typeof opts === "function" ? (opts as ProcessBody) : opts.exec;

    const id: Address =
      typeof opts === "object" && (opts as any).id !== undefined
        ? (opts as any).id
        : Address.create({});

    return new ProcessFactory({
      id,
      exec: ({ input }) => {
        const process = new DefaultProcess({
          controller: this.controllerProvider(input),
          source: fn,
        });
        return process;
      },
    });
  }

  fromMethod(
    opts:
      | {
          input?: any;
          output?: any;
          id?: Address;
          exec: (...args: any[]) => any | void;
        }
      | ((...args: any[]) => any | void)
  ): ProcessFactory {
    let fn: (...args: any[]) => any | void;
    let id: Address;

    if (typeof opts === "function") {
      fn = opts;
      id = Address.create({});
    } else {
      fn = opts.exec;
      id = opts.id ?? Address.create({});
    }

    return new ProcessFactory({
      id,
      exec: ({ input }) => {
        return new DefaultProcess({
          controller: this.controllerProvider(input),
          source: async function* (ctrl: Controller) {
            try {
              const result = await fn(ctrl.state);
              return ctrl.completed(result); // emit Completed event
            } catch (err) {
              return ctrl.error(err);       // emit Error event
            }
          },
        });
      },
    });
  }

  static Default: ProcessFactoryFactory  | null = null;

  static getInstance() {
    if (this.Default === null) {
      this.Default = new ProcessFactoryFactory ("defaultproc");
    }
    return this.Default as ProcessFactoryFactory ;
  }
}
