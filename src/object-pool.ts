import Stack from "./stack";

type Constructor<T> = {new(...args: any[]): T};

export class ObjectPool<T> {
  private _pool:Stack<T>;
  private _type: Constructor<T>;
  
  constructor(_constructor: Constructor<T>) {
    this._type = _constructor;
    this._pool = new Stack();
  }

  get(): T {
    try {
      return this._pool.pop();
    }
    catch {
      return new this._type();
    }
  }

  return(obj: T) {
    this._pool.push(obj);
  }
}

const _sharedPools = new Map<Function, ObjectPool<any>>();

export namespace ObjectPool {
  export function sharedPoolFor<T>(_constructor: Constructor<T>): ObjectPool<T> {
    let pool = _sharedPools.get(_constructor);
    if (typeof pool === "undefined") {
      pool = new ObjectPool(_constructor);
      _sharedPools.set(_constructor, pool);
    }
    return pool as ObjectPool<T>;
  }
}

export default ObjectPool;
