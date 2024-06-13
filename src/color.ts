export class Color implements Color.Immutable {
  r: number;
  g: number;
  b: number;

  constructor(r: number, g: number, b: number) {
    this.r = r | 0;
    this.g = g | 0;
    this.b = b | 0;
  }

  copy(): Color {
    return new Color(this.r, this.g, this.b);
  }

  set(color: Color.Immutable) {
    this.r = color.r;
    this.g = color.g;
    this.b = color.b;
  }

  set3i(r: number, g: number, b: number) {
    this.r = r | 0;
    this.g = g | 0;
    this.b = b | 0;
  }

  equals(color: Color.Immutable): boolean {
    return this.r == color.r && this.g == color.g && this.b == color.b;
  }

  css(): string {
    return `rgb(${this.r},${this.g},${this.b})`;
  }
}

export namespace Color {
  export interface Immutable {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    css(): string;
    equals(color: Color.Immutable): boolean;
  }
}

export default Color;