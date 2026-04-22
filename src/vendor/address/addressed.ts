import { AddressLike } from "./address.js";
import { AddressSetSpec } from './addressset.js';
import { ObjectAddress, ObjectAddressImpl } from "./objectaddress.js";

/** “Referenced” and “Addressed” helpers (unchanged surface) */
export type Referenced<
  ChildType extends Record<string, any> = Record<string, any>,
  Spec extends AddressSetSpec = AddressSetSpec
> = { address: ObjectAddress<Spec> } & ChildType;


export type Addressed<
  Type extends string = string,
  ChildType extends Record<string, any> = Record<string, any>,
  Spec extends AddressSetSpec = AddressSetSpec
> = { type: Type } & Referenced<ChildType, Spec>;


export const Addressed = {
  create<Type extends string, Child extends Record<string, any>, Spec extends AddressSetSpec = AddressSetSpec>(
    type: Type,
    child: Child,
    refs: AddressLike<Spec> | AddressLike<Spec>[]
  ): Addressed<Type, Child, Spec> {
    const address = new ObjectAddressImpl<Spec>(refs as any);
    return { type, address, ...child };
  }
}