import Color from "./color";
import Subject from "./subject";

type Primitive = string | number | boolean;

export class ObservableValue<T extends Primitive> extends Subject {
  private _value: T;

  constructor(value: T) {
    super();
    this._value = value;
  }

  get value(): T {
    return this._value;
  }
  set value(newValue: T) {
    if (this._value == newValue) {
      return;
    }
    this._value = newValue;
    this.notify("change", this._value);
  }

  sync() {
    this.notify("change", this._value);
  }
}

export interface ObservableValue<T> extends Subject {
  notify(name: "change", value: T): void;
}


export class ObservableColor extends Subject {
  private _value: Color;

  constructor(r: number, g: number, b: number) {
    super();
    this._value = new Color(r, g, b);
  }

  get value(): Color.Immutable {
    return this._value;
  }
  set value(newValue: Color.Immutable) {
    this._value.set(newValue);
    this.notify("change", this._value as Color.Immutable);
  }

  sync() {
    this.notify("change", this._value as Color.Immutable);
  }
}

export interface ObservableColor extends Subject {
  notify(name: "change", value: Color.Immutable): void;
}