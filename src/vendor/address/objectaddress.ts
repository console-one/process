// ---------- core.ts ----------

import { uuid } from "../stringutil.js";
import { DefaultDimension } from "./dimension.js";
import { Address, AddressLike, AddressSpec } from "./address.js";
import { RelativeAddressSet, RelativeAddressLike } from "./relativeaddressset.js";
import { AddressSet, AddressSetSpec } from "./addressset.js";
import { RelativeObjectAddress } from "./relativeobjectaddress.js";


export type ObjectAddressArgs<Spec extends AddressSetSpec = AddressSetSpec> =
  | [reference: AddressLike<Spec>]
  | [dim: string, rest: Omit<AddressLike<Spec>, "dim">];


/**
 * A container for the location of an object within multiple dimensions.
 */
export interface ObjectAddress<Spec extends AddressSetSpec = AddressSetSpec> {
  getRoots(): Address<Spec>[];
  toString(): string;
  toJSON(): AddressSet<Spec>
  getPath(dim?: Spec["dim"]): string;
  isRoot(dim?: Spec["dim"]): boolean;
  isVersioned(dim?: Spec["dim"]): boolean;
  getParent(dim?: Spec["dim"]): Spec["parent"] | undefined;
  getVersion(dim?: Spec["dim"]): number | undefined;
  set(...item: ObjectAddressArgs<Spec>): Address<Spec> | undefined;
  get(dim?: Spec["dim"]): Address<Spec>;
  has(dim: Spec["dim"]): boolean;
  remove(dim: Spec["dim"]): boolean;
  equals(other: ObjectAddress<Spec>, dim?: string, compareVersion?: boolean): boolean;
  size(): number;
  dimensions(): Spec["dim"][];
  anchor(): Address<Spec>;
  fork(terms?: ForkInputTerm<Spec>): ObjectAddress<any>;
  setParentPayload< D extends Spec["dim"]>(
    dim: D,
    parent: Spec['parent'] // keep legacy surface
  ): ObjectAddress<Spec>

  [Symbol.iterator](): Iterator<Address<Spec["parent"]>>;
}


export const ObjectAddress = {
  create(data: string) {
    return ObjectAddressImpl.parse(data); 
  },
  describes(x: unknown): x is ObjectAddress<any> {
    if (!x || typeof x !== "object") return false;
    const o = x as any;
    const fns = ["getRoots", "toString", "toJSON", "get", "set", "getPath", "isRoot", "isVersioned"];
    return fns.every((k) => typeof o[k] === "function");
  }
}


export type ForkInputTerm<Spec extends AddressSetSpec> =  (RelativeAddressLike<Spec> | AddressLike<Spec> | string )[] | RelativeAddressSet<Spec> | RelativeObjectAddress<Spec> | { [key: string]: Omit<RelativeAddressLike<Spec>, 'dim'> } | string

export class ObjectAddressImpl<Spec extends AddressSetSpec = AddressSetSpec> implements ObjectAddress<Spec> {
  
  private refs: Address<Spec>[] = [];

  constructor(initial?: Address<Spec> | AddressSet<Spec> | AddressLike<Spec> | AddressSet<Spec> | (AddressLike<Spec> | Address<Spec>)[]) {
    
    if (initial) {
      if (Address.describes(initial)) initial = [initial]; 
      if (AddressSet.describes(initial)) initial = Array.from(Object.values(initial.addresses))
      if (AddressLike.describes(initial)) initial = [initial]
      if (typeof initial === 'object' && Array.isArray(initial)) {
        const list = Array.isArray(initial) ? initial : [initial];
        for (const r of list) this.upsertRef(r as AddressLike<Spec["all"]>);
      } else {
        throw new Error("Initial input to obejct address cannot be interpretted" )
      }
    }
  }

  private upsertRef(rLike: AddressLike<Spec["all"]>) {
    const incoming = Address.create(rLike);
    if (this.refs.length === 0) {
      if (!incoming.path) incoming.path = ""; // allowed for empty anchor
      this.refs.push(incoming as Address<Spec["all"]>);
      return;
    }
    const idx = this.refs.findIndex((r) => r.dim === incoming.dim);
    if (idx >= 0) {
      const cur = this.refs[idx];
      const merged: AddressLike<Spec> = {
        dim: cur.dim,
        path: rLike.path !== undefined ? incoming.path : cur.path,
        version: rLike.version !== undefined ? incoming.version : cur.version,
        parent: rLike.parent !== undefined ? (incoming.parent as Spec["all"]) : cur.parent,
      };
      this.refs[idx] = Address.create(merged)
      return;
    }
    // New dimension: require a path (don’t create pathless refs)
    if (rLike.path === undefined) throw new Error(`Cannot add new dimension "${incoming.dim}" without a path`);
    if (rLike.order === 0) throw new Error("Anchor (index 0) is immutable. Use a non-zero order.");
    if (rLike.order && rLike.order > 0 && rLike.order <= this.refs.length) this.refs.splice(rLike.order, 0, incoming as Address<Spec["all"]>);
    else this.refs.push(incoming as Address<Spec["all"]>);
  }
  
  getRoots(): Address<Spec["parent"]>[] {
    return this.refs.map((r) => Address.clone(r as unknown as Address<Spec["parent"]>));
  }

  toString(): string {
    let strs: string[] = []; 
    if (this.refs.length > 0) {
      for (let i = 0; i < this.refs.length; i++) {
        strs.push(Address.stringify(this.refs[i])); 
      }
    }
    return strs.join(';')
  }

  toJSON(): AddressSet<Spec> {
    return AddressSet.create(this.refs.map(i => i))
  }

  getPath(dim?: Spec["dim"]): string {
    return this.get(dim).path;
  }

  isRoot(dim?: Spec["dim"]): boolean {
    if (!dim) return true;
    return this.refs.length > 0 && this.refs[0].dim === dim;
  }

  isVersioned(dim?: Spec["dim"]): boolean {
    return this.get(dim).version !== undefined;
  }

  getParent(dim?: Spec["dim"]): Spec["parent"] | undefined {
    // Kept for compatibility: returns Spec['parent'] regardless of dim.
    return this.get(dim).parent as unknown as Spec["parent"] | undefined;
  }

  getVersion(dim?: Spec["dim"]): number | undefined {
    return this.get(dim).version;
  }

  set(...item: ObjectAddressArgs<Spec>): Address<Spec> | undefined {
    if (item.length === 1) {
      const [r] = item;
      this.upsertRef(r);
      return this.get((r.dim ?? DefaultDimension) as Spec["dim"]);
    }
    const [dim, rest] = item as [string, Omit<AddressLike<Spec>, "dim">];
    this.upsertRef({ ...rest, dim });
    return this.get(dim as Spec["dim"]);
  }

  get(dim?: Spec["dim"]): Address<Spec["all"]> {
    if (this.refs.length === 0) {
      this.refs.push({ dim: (dim ?? DefaultDimension) as string, path: "" } as Address<Spec["all"]>);
    }
    if (!dim) return this.refs[0];
    const found = this.refs.find((r) => r.dim === dim);
    return found ?? this.refs[0];
  }

  has(dim: Spec["dim"]): boolean {
    return this.refs.some((r) => r.dim === dim);
  }

  remove(dim: Spec["dim"]): boolean {
    const idx = this.refs.findIndex((r) => r.dim === dim);
    if (idx <= 0) return false; // cannot remove anchor
    this.refs.splice(idx, 1);
    return true;
  }

  size(): number {
    return this.refs.length;
  }

  dimensions(): Spec["dim"][] {
    return this.refs.map((r) => r.dim as Spec["dim"]);
  }

  anchor(): Address<Spec> {
    return this.get() as unknown as Address<Spec>;
  }

  /** Keep the original signature; returns ObjectAddress<any> intentionally. */
  fork(terms?: ForkInputTerm<Spec>): ObjectAddress<Spec> {
    if (terms === undefined) {
      const addr = new ObjectAddressImpl<Spec>();
      for (const r of this.refs) {
        addr.set({
          dim: r.dim as string,
          path: r.path,
          version: r.version,
          parent: r.parent,
        });
      }
      return addr;
    }
    
    if (typeof terms === 'string') {
      terms = [{ path: terms }]
    }
    if (RelativeObjectAddress.describes(terms)) terms = terms.all(); 
    if (RelativeAddressSet.describes(terms)) terms = terms.addresses;
    
    if (!Array.isArray(terms) && typeof terms === 'object') {
      let ob: any = terms; 
      terms = []; 
      for (let entry of Object.entries(ob)) {
        let [dimKey, attrs]: [string, any] = entry; 
        if (typeof attrs === 'string') attrs = { path: attrs }; 
        attrs.dim = dimKey; 
        terms.push(attrs);
      }
    }
    
    if (Array.isArray(terms)) {
      const addr = new ObjectAddressImpl<Spec>();
      for (const term of terms) {
        let d = typeof term === 'string'
          ? term
          : ((term.dim === undefined) ? DefaultDimension : term.dim); 
        const r = this.get(d);
        addr.set({ dim: d as string, path: r.path, version: r.version, parent: r.parent });
      }
      return addr; 
    } else {
      throw new Error("Un interpretable fork input~!")
    }
  }

  equals(other: ObjectAddress<Spec>, dim?: string, compareVersion = true): boolean {
    if (dim) {
      const a = this.get(dim as Spec["dim"]);
      const b = other.get(dim as any);
      return Address.compare(a, b, compareVersion);
    }
    if (this.size() !== other.size()) return false;
    for (let i = 0; i < this.refs.length; i++) {
      const a = this.refs[i];
      const b = other.get(a.dim as any);
      if (!Address.compare(a, b, compareVersion)) return false;
    }
    return true;
  }

  setParentPayload< D extends Spec["dim"]>(
    dim: D,
    parent: Spec[D extends Spec["dim"] ? "parent" : never] // keep legacy surface
  ): ObjectAddress<Spec> {
    if (!this.has(dim)) {
      throw new Error(`setParentPayload: dimension "${String(dim)}" does not exist; add it with a path first`);
    }
    this.set(dim, { parent } as any); // merges, preserves path/version
    return this;
  }


  [Symbol.iterator](): Iterator<Address<Spec>> {
    let i = 0;
    const self = this;
    return {
      next(): IteratorResult<Address<Spec>> {
        if (i < self.refs.length) return { value: self.refs[i++] as any, done: false };
        return { value: undefined as any, done: true };
      },
    };
  }

  static fromJSON<U extends AddressSetSpec = AddressSetSpec>(
    item:
      | { dim: string; path: string; version?: number; parent?: unknown }
      | Array<{ dim: string; path: string; version?: number; parent?: unknown }>
      | Record<string, { path: string; version?: number; parent?: unknown }>
  ): ObjectAddressImpl<U> {
    if (Array.isArray(item)) return new ObjectAddressImpl<U>(item as any);
    if (item && typeof item === "object" && "dim" in item && "path" in item) return new ObjectAddressImpl<U>(item as any);
    if (item && typeof item === "object") {
      const arr: AddressLike[] = [];
      for (const [dim, v] of Object.entries(item)) {
        if (!v || typeof v !== "object") continue;
        arr.push({
          dim,
          path: (v as any).path ?? "",
          version: (v as any).version,
          parent: (v as any).parent,
        });
      }
      return new ObjectAddressImpl<U>(arr as any);
    }
    throw new Error("Unsupported JSON shape for ObjectAddressImpl.fromJSON");
  }

  static parse<U extends AddressSetSpec = AddressSetSpec>(s: string = uuid()): ObjectAddress<U> { 
    const parts = (s ?? "")
      .toString()
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean);
    if (parts.length === 0) return new ObjectAddressImpl<U>();
    const refs = parts.map((p) => Address.parse(p));
    return new ObjectAddressImpl<U>(refs as any);
  }
}


export const dims = (...dimensions: string[]) => {
  return dimensions.map(dim => ({ dim: dim }))
}

// ========== small helpers ==========
export type Awaitable<T> = T | Promise<T>;
export const isPromise = <T>(x: Awaitable<T>): x is Promise<T> =>
  !!x && typeof (x as any).then === "function";
