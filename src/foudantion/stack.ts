export class Stack<T> {
  private _array: Array<T | undefined>;
  private _count: number;
  
  constructor() {
    this._array = [];
    this._count = 0;
  }
  
  get length(): number {
    return this._count;
  }

  get capacity(): number {
    return this._array.length;
  }

  clear() {
    this._array.fill(void(0));
    this._count = 0;
  }

  contains(value: T): boolean {
    for (let i = 0; i < this._array.length; i++) {
      if (this._array[i] == value) {
        return true;
      }
    }
    return false;
  }

  peek(): T | undefined {
    return this._array[this._count - 1];
  }

  push(value: T) {
    if (this._array.length == this._count) {
      this._array.push(value);
      this._count++;
      return;
    }
    
    this._array[this._count] = value;
    this._count++;
  }
  
  pop(): T {
    if (this._count == 0) {
      throw new Error("Failed to pop from stack. Stack is empty.");
    }
    this._count--;
    const value = this._array[this._count];
    this._array[this._count] = void(0);
    return value as T;
  }

  shift(): T {
    if (this._count == 0) {
      throw new Error("Failed to shift from stack. Stack is empty.");
    }
    this._count--;
    const value = this._array[0];
    for (let i = 0; i < this._count; i++) {
      this._array[i] = this._array[i+1];
    }
    this._array[this._count] = void(0);
    return value as T;
  }
}

export default Stack;
