import { Address, AddressLike, AddressSpec } from "./address.js";


export type AddressSetSpec = AddressSpec & { all: any }

export type AddressSet<Spec extends AddressSpec=AddressSpec> = {
  type: 'addressset',
  addresses: { [dim: string]: AddressLike<Spec> }
}

export const AddressSet = {
  create<Spec extends AddressSpec=AddressSpec>(items: (AddressLike<Spec> | Address<Spec>)[]): AddressSet<Spec> {
    let byDim: any = {}; 
    for (let addr of items.map(item => Address.create(item))) {
      byDim[addr.dim] = addr;
    }
    return {
      type: 'addressset', 
      addresses: byDim
    }
  },
  describes(item): item is AddressSet {
    return typeof item === 'object' && item['type'] === 'addressset'
  }
}