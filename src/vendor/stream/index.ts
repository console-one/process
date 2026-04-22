import { ListMultimap } from '@console-one/multimap';
import { IndexMap } from '@console-one/collections';

export type Resolver<T=any> = { 
  resolve: ((data: T) => (any | void)), 
  reject: () => any | void,
  value: Promise<T>
}

export const createResolver = <T>(): Resolver<T> => {
  let resolver: { 
      resolve: ((data: T) => (any | void)), 
      reject: () => any | void,
      value?: Promise<T>
      } = { 
      resolve: ((data?: T) => {}), 
      reject: ((err?: Error) => {})
  }
  resolver.value = new Promise<T>((resolve, reject) => {
      resolver.resolve = resolve
      resolver.reject = reject;
  });
  return resolver as Resolver<T>;
}

export interface Publisher<Data=any, Terminal extends any=null> {
  publish(data: Data | Terminal): Promise<void>
}

export interface Subscribable<Data=any, Terminal extends any=null> {
  subscribe(callback:  SubscriberCallback<Data, Terminal>): any
}

export type SubscriberCallback<Data extends any=any, Terminal extends any=null> = ((item: Data | Terminal) => boolean)

// Basically a stream
export class ObjectStream<Data extends any=any, Terminal extends any=null> implements Publisher, Subscribable {

    isTerminal: any
    tail: {
      id: string,
      next: any
    } | undefined
    head: {
      id: string,
      next: any
    } | undefined
    terms: { [key: string]: any }

    private terminal: string | number | undefined
    private index: IndexMap<any>
    private cleanable: boolean
    private _subscriber?: ((item: Data | Terminal) => boolean)

    constructor(isTerminal = (item: any)  => item === null) {
      this.isTerminal = isTerminal;
      this._subscriber = undefined;
      this.index = new IndexMap();
      this.cleanable = false;
      this.tail = undefined; 
      this.head = undefined; 
      this.terminal = undefined;
      this.terms = {} 
    }
  
    get open() {  return this.terminal === undefined;  }
  
    publish(data: any): Promise<void> {
      if (!this.open) throw new Error("Cant publish to closed link");
      if (this.isTerminal(data)) this.terminal = this.index.store(data);
      let resolver = createResolver<void>(); 
      let indexedItem = { data: data, consumed: resolver }; 
      let index = this.index.store(indexedItem);
      this.tail = {
        id: index,
        next: undefined
      } as any
      this.head = this.tail; 
      this.process();
      return resolver.value;
    }

    get hasSubscriber() { return this._subscriber !== undefined;  }

    get isFlowing() { return this.hasSubscriber && this.open;  }
  
    private process(configs: { suppressErrors?: boolean } = {}) {

     
      while (this.isFlowing && this.tail !== undefined && this.tail?.id !== this.head?.id) {
        let { data, consumed } = this.index.get(this.tail.id);
        if (this.head?.id === this.terminal) this.cleanable = true;
        if (this.subscribed !== undefined) {
          try {
            let cancel = this.subscribed(data);
            if (cancel) this.subscriber = undefined;
            this.tail = this.tail.next; 
          } catch (err) {
            if (configs.suppressErrors) {
              console.error("Error in receiver streaming item!", err);
              console.error("Suppressing. Removing subscriber. Item was", { data })
              consumed.reject(err);
              this.subscriber = undefined;
              break
            } else {
              console.error("Error in receiver streaming item!", err);
              this.subscriber = undefined;
              throw err;
            }
          }
        }
      }
    }

    get subscribed() { return this._subscriber; }

    set subscriber(subscriber: any) {
      if (subscriber !== undefined) {
        if (this.subscribed) throw new Error("Two Subscribers!")
        this._subscriber = subscriber;
        this.process();
      } else if (!this.cleanable) {
        this._subscriber = subscriber;
      }
    }
  
    subscribe(subscriber: any) { 
      this.subscriber = subscriber  
    }

    toPromise<T=any>(): Promise<T>{
      return new Promise<T>((resolve, reject) => {
        let data: any = [];
        this.subscribe((done: any) => {
          if (done === null) {
            resolve(data);
          } else {
            data.push(done);
          }
        })
      })
    }
  }

export * from './subscribable.js';




