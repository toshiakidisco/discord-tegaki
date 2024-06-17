import htmlWindow from "raw-loader!./window.html";
import htmlButtonOpen from "raw-loader!./button-open.html";

import TegakiCanvas, { PenMode } from "./tegaki-canvas";
import { parseHtml, Outlets } from "./dom";
import { ObservableColor, ObservableValue } from "./observable-value";
import Color from "./color";
import ColorPicker from "./color-picker";
import SizeSelector from "./size-selector";


const DEFAULT_CANVAS_WIDTH = 344;
const DEFAULT_CANVAS_HEIGHT = 135;

/**
 * キャンバスとウィンドウの横幅の差
 */
const WINDOW_CANVAS_PADDING = 84;

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

  private _paletteForeColor: ColorPicker;
  private _paletteBackgroundColor: ColorPicker;
  private _palettePenSize: SizeSelector;

  private _window: HTMLElement;

  constructor() {
    this._state = new State();
    this._outlets = {};

    this._window = parseHtml(htmlWindow, this, this._outlets);
    parseHtml(htmlButtonOpen, this, this._outlets);

    this._canvas = new TegakiCanvas({
      width: DEFAULT_CANVAS_WIDTH,
      height: DEFAULT_CANVAS_HEIGHT,
      foreColor: new Color(128, 0, 0),
      backgroundColor: new Color(240, 224, 214),
    });
    this._outlets["area-draw"].appendChild(this._canvas.canvas);

    document.body.appendChild(this._outlets["window"]);
    document.body.appendChild(this._outlets["button-open"]);

    this._paletteForeColor = new ColorPicker();
    this._paletteBackgroundColor = new ColorPicker();
    this._palettePenSize = new SizeSelector(this._state.penSize.value);

    this.updateStatusText();
    
    this.init();
    this.bind();
  }

  /**
   * 各イベントリスナー登録
   */
  init() {
    const win = this._window;
    // タイトルバードラッグ処理
    {
      const titlebar = this._outlets["titlebar"];
      let _activePointer: number | null = null;
      let _dragStartPosition = {x: 0, y: 0};
      let _pointerOffset = {x: 0, y: 0};
      titlebar.addEventListener("pointerdown", (ev: PointerEvent) => {
        if (_activePointer != null) {
          return;
        }
        _activePointer = ev.pointerId;
        titlebar.setPointerCapture(_activePointer);

        const rect = win.getBoundingClientRect();
        _dragStartPosition.x = rect.x;
        _dragStartPosition.y = rect.y;
        _pointerOffset.x = ev.clientX - rect.x;
        _pointerOffset.y = ev.clientY - rect.y;
      });
      titlebar.addEventListener("pointermove", (ev: PointerEvent) => {
        if (ev.pointerId != _activePointer) {
          return;
        }
        const newLeft = ev.clientX - _pointerOffset.x;
        const newTop = ev.clientY - _pointerOffset.y;
        win.style.left = `${newLeft}px`;
        win.style.top = `${newTop}px`;
        this.adjustWindow();
      });
      titlebar.addEventListener("pointerup", (ev: PointerEvent) => {
        if (_activePointer == ev.pointerId) {
          titlebar.setPointerCapture(_activePointer);
          _activePointer = null;
        }
      });
      titlebar.addEventListener("pointercancel", (ev: PointerEvent) => {
        if (_activePointer != null) {
          titlebar.setPointerCapture(_activePointer);
        }
        _activePointer = null;
      });
    }
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
      this._paletteForeColor.set(value);
    });
    this._state.backgroundColor.addObserver(this, "change", (value: Color.Immutable) => {
      this._outlets["backgroundColor"].style.backgroundColor = value.css();
      this._canvas.state.backgroundColor.set(value);
      this._paletteBackgroundColor.set(value);
    });
    this._state.foreColor.sync();
    this._state.backgroundColor.sync();
    
    // Connect palette to ObservableValue
    this._paletteForeColor.addObserver(this, "change", (c: Color.Immutable) => {
      this._state.foreColor.value = c;
    });
    this._paletteBackgroundColor.addObserver(this, "change", (c: Color.Immutable) => {
      this._state.backgroundColor.value = c;
    });
    this._palettePenSize.addObserver(this, "change", (n: number) => {
      this._state.penSize.value = n;
    });
  }

  /**
   * 標準のステータステキスト
   */
  defaultStatusText() {
    return `倍率x${this._canvas.scale.toPrecision(2)} Ctrl+Z: 元に戻す,  Ctrl+Y: やり直し`;
  }

  /**
   * ステータステキスト表示の更新
   */
  updateStatusText() {
    this._outlets["status"].innerText = this.defaultStatusText();
  }

  private _resetStatusTimer: number = 0;
  /**
   * 一定時間ステータステキストを表示
   */
  showStatus(text: string, duration: number = 3000) {
    this._outlets["status"].innerText = text;
    clearTimeout(this._resetStatusTimer);
    this._resetStatusTimer = window.setTimeout(() => {
      this.updateStatusText();
    }, duration);
  }

  // --------------------------------------------------
  // イベントハンドラ定義
  // --------------------------------------------------

  onClickZoomIn(ev: Event) {
    const maxScale = this.maxCanvasScale();
    if (this._canvas.scale >= maxScale ) {
      return;
    }
    this._changeScale(Math.min(this._canvas.scale + 0.5, maxScale));
  }

  onClickZoomOut(ev: Event) {
    if (this._canvas.scale <= 1) {
      return;
    }
    this._changeScale(Math.max(this._canvas.scale - 0.5, 1));
  }

  private _changeScale(newScale: number) {
    const lastScale = this._canvas.scale;
    this._canvas.scale = newScale;
    const dw = (this._canvas.scale - lastScale) * this._canvas.width;
    const dh = (this._canvas.scale - lastScale) * this._canvas.height;
    const rect = this._window.getBoundingClientRect();
    this._window.style.left = `${rect.x - dw/2}px`;
    this._window.style.top = `${rect.y - dh/2}px`;
    this.adjustWindow();

    this.updateStatusText();
  }

  onClickOpen(ev: Event) {
    const win = this._window;
    const d = win.style.display;
    if (d != "block") {
      win.style.display = "block";
      win.style.left = `${document.body.clientWidth/2 - win.clientWidth/2}px`;
      win.style.top = `${document.body.clientHeight/2 - win.clientHeight/2}px`;
    }
    else {
      win.style.display = "none";
    }
  }

  onClickClose(ev: Event) {
    this._window.style.display = "none";
  }

  onClickPen(ev: Event) {
    this._state.penMode.value = "pen";
  }

  onClickEracer(ev: Event) {
    this._state.penMode.value = "eracer";
  }

  onClickPenSize(ev: MouseEvent) {
    this._palettePenSize.open(ev.clientX, ev.clientY);
  }

  onClickForeColor(ev: MouseEvent) {
    this._paletteForeColor.open(ev.clientX, ev.clientY);
  }

  onClickBackgroundColor(ev: MouseEvent) {
    this._paletteBackgroundColor.open(ev.clientX, ev.clientY);
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

  /**
   * ウィンドウの位置(&キャンバスの倍率)の調整
   */
  adjustWindow() {
    const maxScale = this.maxCanvasScale();
    if (this._canvas.scale > maxScale) {
      this._canvas.scale = maxScale;
    }

    const win = this._window;
    const rect = win.getBoundingClientRect();
    if (rect.x < 0) {
      win.style.left = "0";
    }
    else if (rect.right > window.innerWidth) {
      win.style.left = `${window.innerWidth - win.clientWidth}px`;
    }
    if (rect.y < 0) {
      win.style.top = "0";
    }
    else if (rect.bottom > window.innerHeight) {
      win.style.top = `${window.innerHeight - win.clientHeight}px`;
    }
  }

  /**
   * キャンバスの表示できる最大倍率
   */
  maxCanvasScale() {
    return (window.innerWidth - WINDOW_CANVAS_PADDING)/this._canvas.width;
  }
}

const app = new DiscordTegaki();
console.log("[Discord Tegaki]launched");
