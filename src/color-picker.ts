import { Outlets, parseHtml } from "./dom";
import Subject from "./subject";
import Color from "./color";

type ColorChar = "r" | "g" | "b";
const RGBColorChars: ColorChar[] = ["r", "g", "b"] as const;

const VALUE_MIN = 0;
const VALUE_MAX =255;

export class ColorPicker extends Subject {
  readonly element: HTMLDivElement;
  private _outlets: Outlets;
  private _color: Color;

  private _blurCallback: (ev: Event) => void;

  constructor(r: number = 255, g: number = 255, b: number = 255) {
    super();
    this._color = new Color(255, 255, 255);
    this._outlets = {};
    this.element = parseHtml(`
      <div class="color-picker" name="root" tabindex="-1">
        <ul>
          <li><div class="preview" name="preview"></div></li>
          <li><span>R: </span><input type="range" name="slider-r" min="${VALUE_MIN}" max="${VALUE_MAX}"><input type="number" name="field-r" min="${VALUE_MIN}" max="${VALUE_MAX}"></li>
          <li><span>G: </span><input type="range" name="slider-g" min="${VALUE_MIN}" max="${VALUE_MAX}"><input type="number" name="field-g" min="${VALUE_MIN}" max="${VALUE_MAX}"></li>
          <li><span>B: </span><input type="range" name="slider-b" min="${VALUE_MIN}" max="${VALUE_MAX}"><input type="number" name="field-b" min="${VALUE_MIN}" max="${VALUE_MAX}"></li>
        </ul>
      </div>
    `, this, this._outlets) as HTMLDivElement;
    document.body.appendChild(this.element);

    this._blurCallback = (ev: Event) => {
      if (!isChildOf(ev.target as Element, this.element)) {
        this.close();
      }
    };

    this.init();
    this.render();
  }

  render() {
    for (const c of RGBColorChars) {
      const slider = this._outlets["slider-" + c] as HTMLInputElement;
      const field = this._outlets["field-" + c] as HTMLInputElement;
      const value = this._color[c].toString();
      slider.value = value;
      field.value = value;
    }
    this._outlets["preview"].style.backgroundColor = this._color.css();
  }

  open(x: number, y: number) {
    const root = this._outlets["root"];
    root.style.left = `${x}px`;
    root.style.top = `${y}px`;
    root.style.display = "block";
    root.focus();
    
    window.addEventListener("focusin", this._blurCallback);
  }

  close() {
    this._outlets["root"].style.display = "none";
    window.removeEventListener("focusin", this._blurCallback);
  }

  init() {
    this._outlets["root"].addEventListener("keydown", (ev) => {
      ev.stopPropagation();
    });

    for (const c of RGBColorChars) {
      for (const type of ["slider", "field"]) {
        const elem = this._outlets[type + "-" + c] as HTMLInputElement;
        
        elem.addEventListener("input", (ev) => {
          this._color[c] = parseInt(elem.value);
          this._color[c] = clamp(this._color[c], VALUE_MIN, VALUE_MAX);
          this.render();
        });
        elem.addEventListener("wheel", (ev: WheelEvent) => {
          this._color[c] += ev.deltaY > 0 ? -1 : 1;
          this._color[c] = clamp(this._color[c], VALUE_MIN, VALUE_MAX);
          this.render();
          this.notify("change", this._color as Color.Immutable);
        });
        elem.addEventListener("change", (ev) => {
          this._color[c] = parseInt(elem.value);
          this._color[c] = clamp(this._color[c], VALUE_MIN, VALUE_MAX);
          this.render();
          this.notify("change", this._color as Color.Immutable);
        })
      }
    }
  }

  set(color: Color.Immutable) {
    if (this._color.equals(color)) {
      return;
    }
    this._color.set(color);
    this.render();
  }

  get color(): Color.Immutable {
    return this._color;
  }
}

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function isChildOf(child: Element | null, parent: Element) {
  while (child != null) {
    if (child == parent) {
      return true;
    }
    child = child.parentElement;
  }
  return false;
}

export default ColorPicker;
