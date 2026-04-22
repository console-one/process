import { uuid } from "../stringutil.js";
import { ObjectAddress, ObjectAddressImpl } from "./objectaddress.js";
import { Address, AddressLike } from "./address.js";
import { AddressSetSpec } from "./addressset.js";

export type LocationFactoryInput<Spec extends AddressSetSpec=AddressSetSpec> =
  | { address: ObjectAddress<Spec> }
  | { location: AddressLike<Spec> | Address<Spec> |  string };

export type Addressable<Item extends Record<any, any>=Record<any, any>, Spec extends AddressSetSpec=AddressSetSpec> = Item & LocationFactoryInput<Spec>;

export type LocationLike<Spec extends AddressSetSpec=AddressSetSpec> = AddressLike<Spec> | Address<Spec> | string 

export const LocationLike = {
  describes(item: any): item is LocationLike {
    return AddressLike.describes(item)
  }
}

/**
 * An item tagged with a means to make it addressible.
 */
export const Addressable = {
  create<Item extends Record<any, any>=Record<any, any>, Spec extends AddressSetSpec=AddressSetSpec>(
    item: Item, 
    location: LocationLike<Spec>
  ): Addressable<Item, Spec> {
    if (typeof location === 'string') {
      return {
        ...item, 
        address: ObjectAddressImpl.parse(location)
      }
    }
    if (AddressLike.describes(location)) {
      return {
        ...item, 
        location: location
      }
    }
    return {
      ...item,
      location: location
    }
  },
  describes(item: any): item is Addressable {
    return (
      typeof item === 'object' && 
      (
        (item['address'] !== undefined && Address.describes(item['address'])) ||
        (item['location'] !== undefined)
      )
    )
  },
  
  getAddress<Item extends Record<any, any>=Record<any, any>, Spec extends AddressSetSpec=AddressSetSpec>(
    item: Addressable<Item, Spec>,  
    createID?: (item?: any) => string
  ): ObjectAddress<Spec> {
    if ("address" in item) return item.address;
    if ("location" in item) {
      if (typeof (item as any).location === "string") {
        return new ObjectAddressImpl<Spec>({ path: (item as any).location });
      } else {
        const id = createID !== undefined ? createID(item) : uuid();
        return new ObjectAddressImpl<Spec>({ path: id });
      }
    }
    throw new Error("Cannot get address for item!");
  }
}
