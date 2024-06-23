/**
 * 最大容量が定められたスタック
 */
export class FiniteStack<T> {
  private _idx: number = 0;
  private _length: number = 0;
  private _array: (T | undefined)[];
  readonly capacity: number;
  
  constructor(capacity: number) {
    this.capacity = capacity;
    this._array = new Array(capacity);
  }

  push(value: T) {
    this._array[this._idx] = value;
    this._idx = (this._idx + 1)%this.capacity;
    if (this._length < this.capacity) {
      this._length++;
    }
  }

  pop() {
    if (this._length == 0) {
      throw new Error("Failed to pop from stack. Stack is empty.");
    }
    this._idx = -1;
    if (this._idx < 0) {
      this._idx += this.capacity;
    }
    this._length--;
    const value = this._array[this._idx] as T;
    this._array[this._idx] = void(0);
    return value;
  }
  
  peek(n: number = 0) {
    if (n >= this._length) {
      return void(0);
    }
    let idx = ((this._idx - 1 - n) % this.capacity);
    if (idx < 0) {
      idx += this.capacity;
    }
    return this._array[idx] as T;
  }

  fill(value: T) {
    this._array.fill(value);
    this._length = this.capacity;
  }

}

export default FiniteStack;
