import { Outlets, adjustPosition, parseHtml } from "./dom";
import { clamp } from "./funcs";
import Panel from "./panel";

const VALUE_MIN = 1;
const VALUE_MAX =20;

export class SizeSelector extends Panel {
  readonly contents: HTMLElement;
  private _outlets: Outlets;
  private _value: number;

  constructor(root: HTMLElement, value: number) {
    super(root, "size-selector");
    this._value = value;
    this._outlets = {};
    this.contents = parseHtml(`
      <ul>
        <li class="row-preview"><div class="preview" name="preview"></div></li>
        <li><span>太さ: </span><input type="range" name="slider" min="${VALUE_MIN}" max="${VALUE_MAX}"><input type="number" name="field" min="${VALUE_MIN}" max="${VALUE_MAX}"></li>
      </ul>
    `, this, this._outlets);
    this.setContents(this.contents);

    this.hasTitleBar = false;
    this.hasCloseButton = false;
    this.autoClose = true;

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

  init() {
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

export default SizeSelector;
