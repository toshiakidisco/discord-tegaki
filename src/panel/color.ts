import { Outlets, adjustPosition, parseHtml } from "../dom";
import Color from "../foudantion/color";
import Panel from "./panel";
import { clamp } from "../funcs";
import Offscreen from "../canvas-offscreen";
import ViewColorPicker from "../foudantion/color-picker";
import { ObservableColor } from "../foudantion/observable-value";
import ViewHuebar from "../foudantion/huebar";

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

export class PanelColor extends Panel {
  readonly contents: HTMLElement;
  private _outlets: Outlets;
  private _color: Color;
  private _picker: ViewColorPicker;
  private _huebar: ViewHuebar;

  private _bindedColor: ObservableColor | null = null;

  private _palette: PaletteItem[];
  private _dragging: boolean = false;

  constructor(root: HTMLElement, r: number = 255, g: number = 255, b: number = 255) {
    super(root, "panel-color");
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
            <li name="picker">
            </li>
          </ul>
        </div>
      </div>
    `, this, this._outlets);

    this._picker = new ViewColorPicker();
    this._picker.setSize(122, 76);
    this._picker.addObserver(this, "change", (color: Color.Immutable) => {
      this.change(color);
    });
    this._outlets["picker"].appendChild(this._picker.element);

    this._huebar = new ViewHuebar();
    this._huebar.setSize(24, 76);
    this._huebar.bind(this._picker.observable.hue);
    this._huebar.addObserver(this, "change", (hue: number) => {
      this._picker.onChange();
    });
    this._outlets["picker"].appendChild(this._huebar.element);
    

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
          this.change(color);
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

  bind(observable: ObservableColor | null) {
    if (this._bindedColor != null) {
      this.removeObserver(this);
    }
    
    this._bindedColor = observable;
    this._picker.bind(observable);

    if (observable != null) {
      observable.addObserver(this, "change", (color) => {
        this._color.set(color);
        this.render();
      });
    }
  }

  render() {
    const preview = this._outlets["preview"];
    preview.style.backgroundColor = this._color.css();

    const s = this._picker.saturation;
    const v = this._picker.value;
    preview.style.color = v > 0.5 && s < 0.5 ? "black" : "white";
    preview.innerText = colorToText(this._color);
  }

  init() {
  }

  change(color: Color.Immutable) {
    if (this._color.equals(color)) {
      return;
    }
    this.set(color);
    if (this._bindedColor != null) {
      this._bindedColor.value = color;
    }
    this.notify("change", color);
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

function colorToText(color: Color.Immutable) {
  return `rgb(${padding(color.r, " ", 3)},${padding(color.g, " ", 3)},${padding(color.g, " ", 3)})`;
}

function padding(num: number, char: string, len: number) {
  let text = (num | 0).toString();
  while (text.length < len) {
    text = char + text;
  }
  return text;
}

export default PanelColor;
