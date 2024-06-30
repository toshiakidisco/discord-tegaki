export class Rect implements Rect.Immutable {
  x: number;
  y: number;
  width: number;
  height: number;

  constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  set(rect: Rect.Immutable): this {
    this.x = rect.x;
    this.y = rect.y;
    this.width = rect.width;
    this.height = rect.height;
    return this;
  }

  set4f(x: number, y: number, width: number, height: number): this {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    return this;
  }

  offset(x: number, y: number): this {
    this.x += x;
    this.y += y;
    return this;
  }

  copy(): Rect {
    return new Rect(this.x, this.y, this.width, this.height);
  }
  
  isEmpty(): boolean {
    return this.width <= 0 || this.height <= 0;
  }

  expand(n: number): this {
    this.x -= n;
    this.y -= n;
    this.width += n*2;
    this.height += n*2;
    return this;
  }

  scale(scale: number): this {
    this.x *= scale;
    this.y *= scale;
    this.width *= scale;
    this.height *= scale;
    return this;
  }

  floor(): this {
    const right = (this.x + this.width) | 0;
    const bottom = (this.y + this.height) | 0;
    this.x = this.x | 0;
    this.y = this.y | 0;
    this.width = right - this.x;
    this.height = bottom - this.y;
    return this;
  }

  normalize(): this {
    if (this.width < 0) {
      this.x += this.width;
      this.width = -this.width;
    }
    if (this.height < 0) {
      this.y += this.height;
      this.height = -this.height;
    }
    return this;
  }

  intersection(r: Rect.Immutable): this  {
    return this.intersection4f(r.x, r.y, r.width, r.height);
  }

  intersection4f(x: number, y: number, width: number, height: number): this  {
    if (
      this.x + this.width  <= x ||
      this.y + this.height <= y ||
      x + width  <= this.x ||
      y + height <= this.y
    ) {
      this.set4f(0, 0, 0, 0,);
      return this;
    }
  
    const left   = Math.max(this.x, x);
    const top    = Math.max(this.y, y);
    const right  = Math.min(this.x + this.width,  x + width);
    const bottom = Math.min(this.y + this.height, y + height);
    this.set4f(left, top, right - left, bottom - top);
    return this;
  }

  isPointIn2f(x: number, y: number): boolean {
    return this.x <= x && this.y <= y && x < this.x + this.width && y < this.y + this.height;
  }


  toString(): string {
    return `{x: ${this.x}, y: ${this.y}, width: ${this.width}, height: ${this.height}}`
  }

  static intersection(r1: Rect.Immutable, r2: Rect.Immutable) {
    const rect = new Rect(r1.x, r1.y, r1.width, r1.height);
    return rect.intersection(r2);
  }
}

export namespace Rect {
  export interface Immutable {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    isEmpty(): boolean;
    copy(): Rect;
    isPointIn2f(x: number, y: number): boolean;
  }
}

export default Rect;
