import { Outlets, adjustPosition, parseHtml } from "./dom";
import Color from "./color";
import Panel from "./panel";
import { clamp } from "./funcs";
import Offscreen from "./canvas-offscreen";

type ColorChar = "r" | "g" | "b";
const RGBColorChars: ColorChar[] = ["r", "g", "b"] as const;

const VALUE_MIN = 0;
const VALUE_MAX =255;

const PALETTE_COLS = 4;
const PALETTE_ROWS = 4;

type PaletteItem = {
  element: HTMLElement;
  readonly color: Color;
}

export class ColorPicker extends Panel {
  readonly contents: HTMLElement;
  private _outlets: Outlets;
  private _color: Color;

  private _palette: PaletteItem[];
  private _dragging: boolean = false;

  constructor(root: HTMLElement, r: number = 255, g: number = 255, b: number = 255) {
    super(root, "color-picker");
    this._color = new Color(255, 255, 255);
    this._outlets = {};
    this.contents = parseHtml(`
      <div class="wrap">
        <div class="area-palette">
          <ul name="colors" class="colors">
          </ul>
        </div>
        <div class="area-picker">
          <ul>
            <li><div class="preview" name="preview" draggable="true" data-on-drag="onDragPreview" data-on-dragstart="onDragPreviewStart" data-on-dragend="onDragPreviewEnd"></div></li>
            <li>
              <span class="color-char">R:</span>
              <input type="range" name="slider-r" min="${VALUE_MIN}" max="${VALUE_MAX}">
              <input type="number" name="field-r" min="${VALUE_MIN}" max="${VALUE_MAX}">
            </li>
            <li>
              <span class="color-char">G:</span>
              <input type="range" name="slider-g" min="${VALUE_MIN}" max="${VALUE_MAX}">
              <input type="number" name="field-g" min="${VALUE_MIN}" max="${VALUE_MAX}">
            </li>
            <li>
              <span class="color-char">B:</span>
              <input type="range" name="slider-b" min="${VALUE_MIN}" max="${VALUE_MAX}">
              <input type="number" name="field-b" min="${VALUE_MIN}" max="${VALUE_MAX}">
            </li>
          </ul>
        </div>
      </div>
    `, this, this._outlets);
    this.setContents(this.contents);

    this.hasTitleBar = false;
    this.hasCloseButton = false;
    this.autoClose = true;

    // Create palette
    this._palette = [];
    const colorsElem = this._outlets["colors"];
    for (let y = 0; y < PALETTE_ROWS; y++) {
      for (let x = 0; x < PALETTE_COLS; x++) {
        const elem = document.createElement("li");
        elem.style.backgroundColor = "#FFFFFF";
        colorsElem.appendChild(elem);
        const color = new Color(255, 255, 255);
        const item = {
          element: elem, color: color
        };
        this._palette.push(item);
        elem.onclick = () => {
          this.set(color);
          this.notify("change", this._color as Color.Immutable);
        };
        elem.addEventListener("dragover", (ev: DragEvent) => {
          ev.preventDefault();
        }, false);
        elem.addEventListener("drop", (ev: DragEvent) => {
          ev.preventDefault();
          if (this._dragging) {
            item.color.set(this.color);
            item.element.style.backgroundColor = item.color.css();
          }
        });
      }
    }

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

  init() {
    for (const c of RGBColorChars) {
      for (const type of ["slider", "field"]) {
        const elem = this._outlets[type + "-" + c] as HTMLInputElement;
        
        elem.addEventListener("input", (ev) => {
          this._color[c] = parseInt(elem.value);
          this._color[c] = clamp(this._color[c], VALUE_MIN, VALUE_MAX);
          this.render();
        });
        elem.addEventListener("wheel", (ev: WheelEvent) => {
          ev.preventDefault();
          this._color[c] += ev.deltaY > 0 ? -1 : 1;
          this._color[c] = clamp(this._color[c], VALUE_MIN, VALUE_MAX);
          this.render();
          this.notify("change", this._color as Color.Immutable);
        }, { passive: false });
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

  setPalette(colors: Color.Immutable[]) {
    const len = Math.min(this._palette.length, colors.length);
    for (let i = 0; i < len; i++) {
      const item = this._palette[i];
      const color = colors[i];
      item.color.set(color);
      item.element.style.backgroundColor = color.css();
    }
  }
  
  onDragPreview(ev: DragEvent) {
  }
  
  onDragPreviewStart(ev: DragEvent) {
    this._dragging = true;
    ev.stopPropagation();
  }
  
  onDragPreviewEnd(ev: DragEvent) {
    this._dragging = false;
    ev.stopPropagation();
  }
}

export default ColorPicker;
