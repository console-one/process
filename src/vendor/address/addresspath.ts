export type RelativeAddressPath = string


export const RelativeAddressPath = {
  describes(item: any): item is RelativeAddressPath {
    return typeof item === 'string'
  }
}

export type AbsoluteAddressPath = string

export const AbsoluteAddressPath = {
  describes(item: any): item is AbsoluteAddressPath {
    return typeof item === 'string'
  }
}

export type AddressPath =  RelativeAddressPath | AbsoluteAddressPath

export const AddressPath = {
  describes(item: any): item is AddressPath {
    return RelativeAddressPath.describes(item) || AbsoluteAddressPath.describes(item)
  }
}