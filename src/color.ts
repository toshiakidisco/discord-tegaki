export class Color implements Color.Immutable {
  r: number;
  g: number;
  b: number;
  a: number;

  constructor(r: number, g: number, b: number, a:number = 1) {
    this.r = r | 0;
    this.g = g | 0;
    this.b = b | 0;
    this.a = a;
  }

  copy(): Color {
    return new Color(this.r, this.g, this.b, this.a);
  }

  set(color: Color.Immutable) {
    this.r = color.r;
    this.g = color.g;
    this.b = color.b;
    this.a = color.a;
  }

  set3i(r: number, g: number, b: number) {
    this.r = r | 0;
    this.g = g | 0;
    this.b = b | 0;
  }

  set4f(r: number, g: number, b: number, a: number) {
    this.r = r | 0;
    this.g = g | 0;
    this.b = b | 0;
    this.a = a;
  }

  equals(color: Color.Immutable): boolean {
    return this.r == color.r && this.g == color.g && this.b == color.b && this.a == color.a;
  }

  css(): string {
    if (this.a == 1) {
      return `rgb(${this.r},${this.g},${this.b})`;
    }
    else {
      return `rgba(${this.r},${this.g},${this.b},${this.a})`;
    }
  }
}

export namespace Color {
  export interface Immutable {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly a: number;
    css(): string;
    equals(color: Color.Immutable): boolean;
    copy(): Color;
  }

  export const black: Color.Immutable = new Color(0, 0, 0);
  export const white: Color.Immutable = new Color(255, 255, 255);
  export const transparent: Color.Immutable = new Color(0, 0, 0, 0);
}


export default Color;