import htmlWindow from "raw-loader!./window.html";
import htmlButtonOpen from "raw-loader!./button-open.html";

import TegakiCanvas, { PenMode } from "./tegaki-canvas";
import { parseHtml, Outlets } from "./dom";
import { ObservableColor, ObservableValue } from "./observable-value";
import Color from "./color";
import ColorPicker from "./color-picker";
import SizeSelector from "./size-selector";

const DEFAULT_STATUS = `Ctrl+Z: 元に戻す,  Ctrl+Y: やり直し`;

class State {
  penMode: ObservableValue<PenMode> = new ObservableValue("pen");
  penSize: ObservableValue<number> = new ObservableValue(4);
  foreColor: ObservableColor = new ObservableColor(128, 0, 0);;
  backgroundColor: ObservableColor = new ObservableColor(240, 224, 214);
}

class DiscordTegaki {
  private _outlets: Outlets;
  private _canvas: TegakiCanvas;
  private _state: State;

  private _palleteForeColor: ColorPicker;
  private _palleteBackgroundColor: ColorPicker;
  private _palletePenSize: SizeSelector;

  constructor() {
    this._state = new State();
    this._outlets = {};

    parseHtml(htmlWindow, this, this._outlets);
    parseHtml(htmlButtonOpen, this, this._outlets);

    this._canvas = new TegakiCanvas();
    this._outlets["area-draw"].appendChild(this._canvas.canvas);

    document.body.appendChild(this._outlets["window"]);
    document.body.appendChild(this._outlets["button-open"]);

    this._palleteForeColor = new ColorPicker();
    this._palleteBackgroundColor = new ColorPicker();
    this._palletePenSize = new SizeSelector(this._state.penSize.value);

    this._outlets["status"].innerText = DEFAULT_STATUS;

    this.bind();
  }

  /**
   * ObservableValue と View 間のバインド
   */
  bind() {
    // Connect ObservableValue to views
    // PenMode
    this._state.penMode.addObserver(this, "change", (val: PenMode) => {
      for (const name of ["pen", "eracer"]) {
        const icon = this._outlets[`icon-${name}`] as HTMLImageElement;
        const active = val == name ? "active" : "deactive";
        icon.src = chrome.runtime.getURL(`asset/tool-${name}-${active}.png`);
      }

      this._canvas.state.penMode = val;
    });
    this._state.penMode.sync();

    // PenSize
    this._state.penSize.addObserver(this, "change", (val: number) => {
      this._canvas.state.penSize = val;
      this._outlets["tool-size-value"].innerText = val.toString();
    });
    this._state.penSize.sync();

    // Color
    this._state.foreColor.addObserver(this, "change", (value: Color.Immutable) => {
      this._outlets["foreColor"].style.backgroundColor = value.css();
      this._canvas.state.foreColor.set(value);
      this._palleteForeColor.set(value);
    });
    this._state.backgroundColor.addObserver(this, "change", (value: Color.Immutable) => {
      this._outlets["backgroundColor"].style.backgroundColor = value.css();
      this._canvas.state.backgroundColor.set(value);
      this._palleteBackgroundColor.set(value);
    });
    this._state.foreColor.sync();
    this._state.backgroundColor.sync();
    
    // Connect pallete to ObservableValue
    this._palleteForeColor.addObserver(this, "change", (c: Color.Immutable) => {
      this._state.foreColor.value = c;
    });
    this._palleteBackgroundColor.addObserver(this, "change", (c: Color.Immutable) => {
      this._state.backgroundColor.value = c;
    });
    this._palletePenSize.addObserver(this, "change", (n: number) => {
      this._state.penSize.value = n;
    });
  }

  private _resetStatusTimer: number = 0;
  /**
   * 一定時間ステータステキストを表示
   */
  showStatus(text: string, duration: number = 3000) {
    this._outlets["status"].innerText = text;
    clearTimeout(this._resetStatusTimer);
    this._resetStatusTimer = window.setTimeout(() => {
      this._outlets["status"].innerText = DEFAULT_STATUS;
    }, duration);
  }

  // --------------------------------------------------
  // イベントハンドラ定義
  // --------------------------------------------------

  onClickZoomIn(ev: Event) {
    if (this._canvas.scale < 4) {
      this._canvas.scale += 0.5;
    }
  }

  onClickZoomOut(ev: Event) {
    if (this._canvas.scale > 1) {
      this._canvas.scale -= 0.5;
    }
  }

  onClickOpen(ev: Event) {
    const win = this._outlets["window"];
    const d = win.style.display;
    if (d != "block") {
      this._outlets["window"].style.display = "block";
      win.style.left = `${document.body.clientWidth/2 - win.clientWidth/2}px`;
      win.style.top = `${document.body.clientHeight/2 - win.clientHeight/2}px`;
    }
    else {
      win.style.display = "none";
    }
  }

  onClickClose(ev: Event) {
    this._outlets["window"].style.display = "none";
  }

  onClickPen(ev: Event) {
    this._state.penMode.value = "pen";
  }

  onClickEracer(ev: Event) {
    this._state.penMode.value = "eracer";
  }

  onClickPenSize(ev: MouseEvent) {
    this._palletePenSize.open(ev.clientX, ev.clientY);
  }

  onClickForeColor(ev: MouseEvent) {
    this._palleteForeColor.open(ev.clientX, ev.clientY);
  }

  onClickBackgroundColor(ev: MouseEvent) {
    this._palleteBackgroundColor.open(ev.clientX, ev.clientY);
  }

  onClickClear(ev: Event) {
    this._canvas.clear();
  }

  onClickFill(ev: Event) {
    this._canvas.fill();
  }

  async onClickCopy(ev: Event): Promise<void> {
    await this._canvas.copyToClipboard();
    this.showStatus("クリップボードにコピーしました");
  }

  onKeydown(ev: KeyboardEvent) {
    // Discord側にイベントを吸われないように
    ev.stopPropagation();
    if (ev.ctrlKey && ev.key == "z") {
      this._canvas.undo();
    }
    else if (ev.ctrlKey && ev.key == "y") {
      this._canvas.redo();
    }
  }
}

const app = new DiscordTegaki();
console.log("[Discord Tegaki]launched");
