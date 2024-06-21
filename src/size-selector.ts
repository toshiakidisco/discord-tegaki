import { Outlets, adjustPosition, parseHtml } from "./dom";
import Subject from "./subject";

const VALUE_MIN = 1;
const VALUE_MAX =20;

export class SizeSelector extends Subject {
  readonly element: HTMLDivElement;
  private _outlets: Outlets;
  private _value: number;

  private _blurCallback: (ev: Event) => void;

  constructor(root: HTMLElement, value: number) {
    super();
    this._value = value;
    this._outlets = {};
    this.element = parseHtml(`
      <div class="size-selector" name="root" tabindex="-1">
        <ul>
          <li class="row-preview"><div class="preview" name="preview"></div></li>
          <li><span>太さ: </span><input type="range" name="slider" min="${VALUE_MIN}" max="${VALUE_MAX}"><input type="number" name="field" min="${VALUE_MIN}" max="${VALUE_MAX}"></li>
        </ul>
      </div>
    `, this, this._outlets) as HTMLDivElement;
    root.appendChild(this.element);

    this._blurCallback = (ev: Event) => {
      if (!isChildOf(ev.target as Element, this.element)) {
        this.close();
      }
    };

    this.init();
    this.render();
  }

  render() {
    const slider = this._outlets["slider"] as HTMLInputElement;
    const field = this._outlets["field"] as HTMLInputElement;
    const value = this._value.toString();
    slider.value = value;
    field.value = value;
    this._outlets["preview"].style.height = `${this._value}px`;
  }

  open(x: number, y: number) {
    const root = this.element;
    root.style.left = `${x}px`;
    root.style.top = `${y}px`;
    root.style.display = "block";
    root.focus();
    adjustPosition(root);
    
    window.addEventListener("focusin", this._blurCallback);
  }

  close() {
    this._outlets["root"].style.display = "none";
    window.removeEventListener("focusin", this._blurCallback);
  }

  init() {
    this._outlets["root"].addEventListener("keydown", (ev) => {
    });

    for (const type of ["slider", "field"]) {
      const elem = this._outlets[type] as HTMLInputElement;
      
      elem.addEventListener("input", (ev) => {
        this._value = parseInt(elem.value);
        this._value = clamp(this._value, VALUE_MIN, VALUE_MAX);
        this.render();
      });
      elem.addEventListener("wheel", (ev: WheelEvent) => {            
        ev.preventDefault();
        this._value += ev.deltaY > 0 ? -1 : 1; 
        this._value = clamp(this._value, VALUE_MIN, VALUE_MAX);
        this.render();
        this.notify("change", this._value);
      }, { passive: false });
      elem.addEventListener("change", (ev) => {
        this._value = parseInt(elem.value);
        this._value = clamp(this._value, VALUE_MIN, VALUE_MAX);
        this.render();
        this.notify("change", this._value);
      });
    }
  }

  set value(val: number) {
    if (this._value == val) {
      return;
    }
    this._value = val;
    this.render();
  }

  get value(): number {
    return this._value;
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

export default SizeSelector;
