
export enum ProcessConstants {
  All        = '*',
  Completed  = 'completed',
  Error      = 'error',
  Logs       = 'log',
  Fork       = 'fork',
  Blocked    = 'blocked',
  Checkpoint = 'checkpoint',
  Data       = 'data',        // user-visible output stream
}

export const TerminalSignals = new Set([
  ProcessConstants.Completed,
  ProcessConstants.Error,
]);

export const ConsumerActivationSignals = new Set([
  ProcessConstants.All,
  ProcessConstants.Completed,
]);


export type ProcessEvent<DataType = any> = {
  type: 'processevent';
  op: string;
  data?: DataType;
  done?: boolean;
  seq?: number,
};

export const ProcessEvent = {
  create(op: string, opts: { data?: any; done?: boolean, seq?: number } = {}): ProcessEvent {
    const ev: ProcessEvent = {
      type: 'processevent',
      op,
      ...(opts.data !== undefined ? { data: opts.data } : {}),
      ...(opts.done !== undefined ? { done: opts.done } : {}),
      ...(opts.seq !== undefined ? { seq: opts.seq } : {})
    };
    return ev;
  },

  describes(value: any): value is ProcessEvent {
    return (
      value !== null &&
      typeof value === 'object' &&
      value.type === 'processevent' &&
      typeof value.op === 'string'
    );
  },
};

export type ProcessEventOr<T = any> = ProcessEvent<T> | T;
