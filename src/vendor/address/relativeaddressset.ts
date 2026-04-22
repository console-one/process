import { AddressLike } from "./address.js"
import { AddressSetSpec } from './addressset.js'
import { RelativeAddressPath } from "./addresspath.js"

export type RelativeAddressLike<Spec extends AddressSetSpec = AddressSetSpec> = (
  { dim?: Spec['dim'], version?: number } | 
  { dim?: Spec['dim'], path: RelativeAddressPath, version?: number } | 
  AddressLike
)

export type RelativeAddressSet<Spec extends AddressSetSpec = AddressSetSpec> = {
  type: 'relativeaddressset',
  addresses: RelativeAddressLike<Spec>[]
}


export const RelativeAddressSet = {
  create<Spec extends AddressSetSpec = AddressSetSpec>(relativeAddresses:  RelativeAddressLike<Spec>[]): RelativeAddressSet<Spec> {
    return {
      type: 'relativeaddressset',
      addresses: relativeAddresses
    }
  },
  describes(item: any): item is RelativeAddressSet {

    return typeof item === 'object' && item !== null && item['type'] === 'relativeaddressset'
  }
}
