

export type WriteableObject<Item extends any=any> = ({ next: (accept: Item) => void, done: () => void })
export type WriteableCallback<Item extends any=any> = (accept: Item | null) => void
export type Writeable<Item extends any=any> = WriteableObject<Item> |  WriteableCallback<Item>
export type Connector<Item  extends any=any> =  (cb: () => void) => Writeable<Item> 

import { IndexMap } from '@console-one/collections';
import { ListMultimap } from '@console-one/multimap';

type Constructor = new (...args: any[]) => {};


export abstract class AbstractSubscribable<Item> {

  public subscribers: IndexMap<any>
  public byTag: ListMultimap<any, any>
  public byPredicate: ListMultimap<any, any>

  constructor() {
    this.subscribers = new IndexMap();
    this.byTag = new ListMultimap<any, any>();  
    this.byPredicate = new ListMultimap<any, any>(); 
  }

  subscribe(...subscription: [callback: Connector<Item>, terms?: { [key: string]: string | number }]) {
    manageSubscriptionLogic<Item>(this.subscribers, this.byTag, this.byPredicate, ...subscription)
  }
}

export function makeSubscribeableMixin<Item extends Constructor>(base: Item) {
  return class Subscribable extends base {

    public _subscribers: IndexMap<any>
    get subscribers() { if (this._subscribers === undefined) this._subscribers = new IndexMap(); return this._subscribers; }
    public _byTag: ListMultimap<any, any>
    get byTag() { if (this._byTag === undefined) this._byTag = new ListMultimap<any, any>();  return this._byTag; }
    public _byPredicate: { [key: string]: ListMultimap<any, any> }
    get byPredicate() { if (this._byPredicate === undefined) this._byPredicate = {}; return this._byPredicate; }

    subscribe(...subscription: [callback: Connector<Item>, terms?: { [key: string]: string | number }]) {
      return manageSubscriptionLogic<Item>(this.subscribers, this.byTag, this.byPredicate, ...subscription)
    }
  }
}


const manageSubscriptionLogic = <Item>(subscribers, byTag, byPredicate, ...subscription: [callback: Connector<Item>, terms?: { [key: string]: string | number }]) => {
  let [callback, terms] = subscription;
  let subscriptionkey = subscribers.lock();
  let setup = false;
  let cancelled = false;
  let handler = callback(() => {
    if (setup && !cancelled) {
      let deleting = subscribers.get(subscriptionkey); 
      subscribers.delete(subscriptionkey);
      for (let tagEntry of Object.entries(tags)) {
        let [tagkey, tagTerm] = tagEntry;
        let items = byTag.get(tagkey);
        let next: any = []; 
        for (let item of items) if (item.item !== subscriptionkey) next.push(item)
        if (next.length > 0) byTag.setAll(tagkey, next)
        else byTag.delete(tagkey);
        let hasPredicate = tagTerm === undefined; 
        if (hasPredicate && byPredicate[tagkey] !== undefined ) {
          let nextPreds = [];
          let allPredListeners = byPredicate[tagkey].get(tagTerm);
          for (let listener of allPredListeners) if (listener !== subscriptionkey) nextPreds.push(listener)
          if (nextPreds.length > 0)  byPredicate[tagkey].setAll(tagTerm, nextPreds)
          else byPredicate[tagkey].delete(tagTerm);
        }
      }
    }
    cancelled = true;
  })
  let handlermethod: WriteableObject<Item> = (typeof handler === 'function') ? { next: handler, done: () => (handler as any)(null) } : handler; 
  let tags = terms ?? {};
  if (cancelled) return ;
  for (let tagEntry of Object.entries(tags)) {
    let [tagkey, tagTerm] = tagEntry;
    let hasPredicate = tagTerm === undefined; 
    let entry = hasPredicate ? { item: subscriptionkey  } : { item: subscriptionkey, predicate: tagTerm }
    byTag.set(tagkey, entry);
    if (hasPredicate) {
      if (byPredicate[tagkey] === undefined ) byPredicate[tagkey] = new ListMultimap<string | number, string>(); 
      byPredicate[tagkey].set(tagTerm, subscriptionkey);
    }
  }
  subscribers.set(subscriptionkey, { ...handlermethod, tags });
  setup = true;
}



