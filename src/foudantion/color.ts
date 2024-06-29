import { clamp } from "../funcs";
import { JsonObject, JsonStructure, JsonValue } from "./json";

export class Color implements Color.Immutable {
  r: number;
  g: number;
  b: number;
  a: number;

  constructor(r: number = 0, g: number = 0, b: number = 0, a:number = 1) {
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

  setHsv(h: number, s: number, v: number) {
    const max = v*255;
    const min = v*(1 - s)*255;
    let r: number, g: number, b: number;
    if (h <= 60) {
      r = max;
      g = (h/60)*(max-min) + min;
      b = min;
    }
    else if (h <= 120) {
      r = ((120-h)/60)*(max-min) + min;
      g = max;
      b = min;
    }
    else if (h <= 180) {
      r = min;
      g = max;
      b = ((h - 120)/60)*(max-min) + min;
    }
    else if (h <= 240) {
      r = min;
      g = ((240 - h)/60)*(max-min) + min;
      b = max;
    }
    else if (h <= 300) {
      r = ((h - 240)/60)*(max-min) + min;
      g = min;
      b = max;
    }
    else {
      r = max;
      g = min;
      b = ((360 - h)/60)*(max-min) + min;
    }
    this.r = Math.round(r);
    this.g = Math.round(g);
    this.b = Math.round(b);

    return this;
  }

  set3i(r: number, g: number, b: number) {
    this.r = r | 0;
    this.g = g | 0;
    this.b = b | 0;

    return this;
  }

  set4f(r: number, g: number, b: number, a: number) {
    this.r = r | 0;
    this.g = g | 0;
    this.b = b | 0;
    this.a = a;

    return this;
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

  /**
   * 16進数カラーコード
   */
  code(): string {
    const r = clamp(this.r, 0, 255);
    const g = clamp(this.r, 0, 255);
    const b = clamp(this.r, 0, 255);
    const v = (r << 16) | (g << 8) | b;
    return `#${v.toString(16)}`;
  }

  /**
   * HSV形式に変換
   */
  hsv(): {h: number, s: number, v: number} {
    const r = this.r;
    const g = this.g;
    const b = this.b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h: number;
    if (max == min) {
      h = 0;
    }
    else if (r == max) {
      h = 60*(g-b)/(max-min);
    }
    else if (g == max) {
      h = 60*(b-r)/(max-min) + 120;
    }
    else {
      h = 60*(r-g)/(max-min) + 240;
    }
    if (h < 0) {
      h += 360;
    }

    const s = max == 0 ? 0 : (max-min)/max;
    const v = max/255;

    return {h, s, v};
  }

  value(): number {
    return Math.max(this.r, this.g, this.b) / 255;
  }

  serialize(): JsonValue {
    return {
      r: this.r,
      g: this.g,
      b: this.b,
      a: this.a,
    };
  }

  static fromHsv(h: number, s: number, v: number): Color {
    const color = new Color();
    color.setHsv(h, s, v);
    return color;
  }

  static deserialize(data: JsonObject): Color {
    const d = data as Color.Serialized;
    const r = d.r;
    const g = d.g;
    const b = d.b;
    const a = (data.a) as number;
    return new Color(r, g, b, a);
  }
}

export namespace Color {
  export interface Immutable {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly a: number;
    css(): string;
    hsv(): {h: number, s: number, v: number};
    value(): number;
    equals(color: Color.Immutable): boolean;
    copy(): Color;
    serialize(): JsonValue;
  }

  export type Serialized = {
    "r": number,
    "g": number,
    "b": number,
    "a": number,
  };

  export const structure: JsonStructure = {
    "r": "number",
    "g": "number",
    "b": "number",
    "a": "number",
  };

  export const black: Color.Immutable = new Color(0, 0, 0);
  export const white: Color.Immutable = new Color(255, 255, 255);
  export const transparent: Color.Immutable = new Color(0, 0, 0, 0);
}


export default Color;