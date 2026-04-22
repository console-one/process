import { AddressSetSpec } from "./addressset.js"
import { DefaultDimension } from "./dimension.js"
import { RelativeAddressLike } from "./relativeaddressset.js"

export type RelativeObjectAddress<Spec extends AddressSetSpec = AddressSetSpec> = {
  type: 'relativeaddress'
  remove(key: Spec['dim'] | number): void
  has(key: Spec['dim']): boolean
  set(val: RelativeAddressLike<Spec> | string, throwOnDup?: boolean): RelativeObjectAddress<Spec>
  setAll(vals: (string | RelativeAddressLike<Spec>)[], throwOnDup?: boolean): RelativeObjectAddress<Spec>
  all(): RelativeAddressLike<Spec>[]
}

export const RelativeObjectAddress = {
  describes(item: any): item is RelativeObjectAddress {
    return typeof item === 'object' && item !== null && item['type'] === 'relativeaddress'
  }
}

export class RelativeObjectAddressImpl<Spec extends AddressSetSpec = AddressSetSpec> implements RelativeObjectAddress<Spec> {
  type: "relativeaddress" = "relativeaddress"
  terms: RelativeAddressLike[]
  indices: { [key: string]: number }
  constructor() {  this.terms = []; this.indices = {} }
  private _getDim(item: RelativeAddressLike): string {
    return item.dim ?? DefaultDimension
  }
 
  remove(idx: number | Spec["dim"]): void {
    let key: number; 
    if (typeof idx === 'number') {
      if (this.terms.length <= idx || idx < 0) {
        throw new Error("Removal index must either be a dimension key or a number for the index of the term to be removed!");
      }
      key = idx; 
    } else {
      if (this.indices[idx] === undefined) {
        throw new Error("No known term has the dimension: " + idx);
      }
      key = this.indices[idx]; 
    }
  
    // Remove the term at index `key`
    this.terms.splice(key, 1);
  
    // Rebuild indices from scratch
    this.indices = {};
    for (let i = 0; i < this.terms.length; i++) {
      this.indices[this._getDim(this.terms[i])] = i;
    }
  }

  has(key: Spec["dim"]): boolean {
    return (this.indices[key] !== undefined) 
  }
  set(val: string | RelativeAddressLike<Spec>, throwOnDup: boolean = true): RelativeObjectAddress<Spec> {
    let term: RelativeAddressLike<Spec>;
    if (typeof val === 'string') term = { path: val }
    else term = val;
    let termDim = this._getDim(term); 
    if (this.indices[termDim] !== undefined) {
      if (throwOnDup) throw new Error("Two relative paths defined for index: " + termDim);
      this.terms[this.indices[termDim]] = term; 
    } else {
      this.terms.push(term); 
      this.indices[termDim] = this.terms.length -1; 
    }
    return this; 
  }

  setAll(vals: (string | RelativeAddressLike<Spec>)[], throwOnDup: boolean = true): RelativeObjectAddress<Spec> {
    for (let item of vals) this.set(item, throwOnDup); 
    return this; 
  }

  all(): RelativeAddressLike<Spec>[] {
    return this.terms.concat([])
  }

  static create<Spec extends AddressSetSpec = AddressSetSpec>(...vals: (string | RelativeAddressLike<Spec>)[]) {
    let rel = new RelativeObjectAddressImpl<Spec>(); 
    return rel.setAll(vals)
  }
}
