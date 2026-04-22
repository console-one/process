
import { DefaultDimension } from "./dimension.js";
import { AddressPath, RelativeAddressPath } from './addresspath.js'
import path from "node:path";
import { splitFirst, splitLast } from "../stringutil.js";

export type AddressLike<Spec extends AddressSpec=AddressSpec> = {
  type?: 'address';
  dim?: Spec['dim'];
  path?: AddressPath;
  version?: number;
  parent?: Spec['parent'];
  metadata?: Spec['metadata'];
  order?: any
}

export const AddressLike = {
  describes(x: unknown): x is AddressLike {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    const hasKnown = ["dim", "path", "version", "parent", "order"].some((k) => k in o);
    if (!hasKnown) return false;
    if ("dim" in o && o.dim !== undefined && typeof o.dim !== "string") return false;
    if ("path" in o && o.path !== undefined && typeof o.path !== "string") return false;
    if ("version" in o && o.version !== undefined && typeof o.version !== "number") return false;
    if ("order" in o && o.order !== undefined && typeof o.order !== "number") return false;
    return true;
  },
  parse<Spec extends AddressSpec>(s: string): AddressLike<Spec> {
    const trimmed = (s ?? "").toString().trim();
    if (!trimmed) return { dim: DefaultDimension, path: "" };
    const [maybeDim, restAfterDim] = splitFirst(trimmed, ":");
    const hasColon = restAfterDim !== "";
    const dim = hasColon ? (maybeDim || DefaultDimension) : DefaultDimension;
    const body = hasColon ? restAfterDim : maybeDim;
    const [pathPart, versionPart] = splitLast(body, "@");
    const path = pathPart;

    const version =
      versionPart === ""
        ? undefined
        : Number.isNaN(Number(versionPart))
        ? undefined
        : Number(versionPart);

    return { dim, path, version };
  }
}


export interface RelativeAddress<Spec extends AddressSpec=AddressSpec> {
  reference: AddressLike<Spec> | RelativeAddress<Spec>
  path: RelativeAddressPath 
  version?: number 
}
export const RelativeAddress = {
  create<Spec extends AddressSpec=AddressSpec>(reference: AddressLike<Spec> | RelativeAddress<Spec>, path: RelativeAddressPath, version?: number) {
    if ((!RelativeAddress.describes(reference)) || (!AddressLike.describes(reference))) throw new Error("AddressLike doesn't describe reference input!"); 
    if (!RelativeAddressPath.describes(path)) throw new Error("RelativeAddressPath doesn't describe path!"); 
    let obj: any = {
      reference: reference,
      path: path
    }
    if (version !== undefined) obj.version = version; 
    return obj as RelativeAddress; 
  },
  describes<Spec extends AddressSpec=AddressSpec>(item): item is RelativeAddress<Spec> {
    return (
      typeof item === 'object' &&
      item.reference !== undefined &&
      ((RelativeAddress.describes(item.reference)) || (AddressLike.describes(item.reference))) &&
      RelativeAddressPath.describes(item.path)
    )
  }
}

export type AddressSpec = {
  dim: string
  parent: any
  metadata?: any
}

export type Address<Spec extends AddressSpec=AddressSpec> =  {
  type: 'address',
  dim: Spec['dim'];
  path: string;
  parent: Spec['parent'];
  version?: number;
  order?: any
} & (Spec['metadata'] extends never ? { } : { metadata: Spec['metadata']})

export const Address = {

  create<Spec extends AddressSpec=AddressSpec>(rLike: (AddressLike<Spec> | Address<Spec>)): Address<Spec> {
    let reference: any = {
      type: 'address',
      dim: (rLike.dim ?? DefaultDimension) as string,
      path: (rLike.path ?? "") as string,
    };
    if (rLike.version !== undefined) reference.version = rLike.version; 
    if (rLike.parent !== undefined) reference.parent = rLike.parent; 
    if (rLike['metadata'] !== undefined) reference['metadata'] = rLike['metadata'];
    return reference as Address<Spec>
  },

  describes<Spec extends AddressSpec=AddressSpec>(x: unknown): x is Address<Spec> {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    if (typeof o.dim !== "string") return false;
    if (typeof o.path !== "string") return false;
    if ("version" in o && o.version !== undefined && typeof o.version !== "number") return false;
    return true;
  },
  parse<Spec extends AddressSpec=AddressSpec>(x: string): Address<Spec> { 
    let parsed = AddressLike.parse<Spec>(x); 
    return this.create(parsed) 
  },

  stringify<Spec extends AddressSpec=AddressSpec>(r: Address<Spec>) { return `${r.dim}:${r.path}${r.version !== undefined ? `@${r.version}` : ""}`; },
  clone<Spec extends AddressSpec=AddressSpec>(r: Address<Spec>): Address<Spec> { return Address.create({ dim: r.dim, path: r.path, version: r.version, parent: r.parent }); },
  compare<Spec extends AddressSpec=AddressSpec>(a: Address<Spec>, b: Address<Spec>, compareVersion: boolean): boolean {
    if (a.dim !== b.dim) return false;
    if (a.path !== b.path) return false;
    if (compareVersion) return (a.version ?? undefined) === (b.version ?? undefined);
    return true;
  },
  fromRelative<Spec extends AddressSpec=AddressSpec>(rLike: RelativeAddress<Spec>) {
    let stack: any = []; 
    let head: any = rLike.reference; 
    let version: any = undefined; 
    while (!AddressLike.describes(head)) {
      if (version === undefined && head.version !== undefined) version = head.version; 
      stack.push(head); 
      head = head.reference; 
    }
    let basePath: any = head.path; 
    while (stack.length > 0) {
      let next = stack.pop();
      basePath = path.join(basePath, next)
    }
    let rLikeTemp: any = {
      dim: (head.dim ?? DefaultDimension) as string,
      path: basePath,
      parent: head.parent
    }
    if (version !== undefined) rLikeTemp.version = version; 
    return 
  }
}


/** Builder (restored), aligned with the single-generic Address<T>. */
export class AddressBuilder<Spec extends AddressSpec=AddressSpec> {
  private _dim?: string;
  private _path?: string;
  private _version?: number;
  private _parent?: Spec['parent'];
  private _order?: number; // 0 = anchor (immutable)
  addDimension(dim?: string) { this._dim = dim; return this; }
  addPath(path?: string) { this._path = path; return this; }
  addVersion(version?: number) { this._version = version; return this; }
  addParent(parent?: Spec['parent']) { this._parent = parent; return this; }
  addOrder(order?: number) { this._order = order; return this; }
  build(): Address<Spec> {
    const r: AddressLike<Spec> = {};
    if (this._dim !== undefined) r.dim = this._dim;
    if (this._path !== undefined) r.path = this._path;
    if (this._version !== undefined) r.version = this._version;
    if (this._parent !== undefined) r.parent = this._parent;
    if (this._order !== undefined) r.order = this._order;
    return Address.create<Spec>(r);
  }
  buildRef(): Address<Spec> { return Address.create(this.build()); }
  static create<Spec extends AddressSpec=AddressSpec>() { return new AddressBuilder<Spec>();  }
}

