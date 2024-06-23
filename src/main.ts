import htmlWindow from "raw-loader!./window.html";
import htmlButtonOpen from "raw-loader!./button-open.html";

import TegakiCanvas, { PenMode, SubTool } from "./tegaki-canvas";
import { parseHtml, Outlets } from "./dom";
import { ObservableColor, ObservableValue } from "./observable-value";
import Color from "./color";
import ColorPicker from "./color-picker";
import SizeSelector from "./size-selector";
import Selector from "./selector";
import { clamp, isRunnningOnExtension } from "./funcs";
import defaultPalette from "./default-palette";

import manifest from "../manifest.json";
import { getAssetUrl } from "./asset";

import "./scss/main.scss";

const DEFAULT_CANVAS_WIDTH = 344;
const DEFAULT_CANVAS_HEIGHT = 135;

const MIN_CANVAS_WIDTH = 344;
const MIN_CANVAS_HEIGHT = 135;

/**
 * キャンバスとウィンドウの横幅の差
 */
const WINDOW_CANVAS_PADDING_H = 84;
const WINDOW_CANVAS_PADDING_V = 73;

type CanvasInitialState = {
  width: number;
  height: number;
  penSize: number;
  eraserSize: number;
  foreColor: Color;
  backgroundColor: Color;
};

const canvasInitialState: CanvasInitialState = {
  width: DEFAULT_CANVAS_WIDTH,
  height: DEFAULT_CANVAS_HEIGHT,
  penSize: 4,
  eraserSize: 4,
  foreColor: new Color(128, 0, 0),
  backgroundColor: new Color(240, 224, 214),
}

class State {
  penMode: ObservableValue<PenMode> = new ObservableValue("pen");
  penSize: ObservableValue<number> = new ObservableValue(4);
  eraserSize: ObservableValue<number> = new ObservableValue(4);
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

  private _root: HTMLElement;
  private _window: HTMLElement;
  private _keyDownTime: Map<string, number> = new Map();

  constructor() {
    this._state = new State();
    this._outlets = {};

    this._root = parseHtml(htmlWindow, this, this._outlets);
    this._window = this._outlets["window"];

    this._canvas = new TegakiCanvas({
      width: DEFAULT_CANVAS_WIDTH,
      height: DEFAULT_CANVAS_HEIGHT,
      foreColor: new Color(128, 0, 0),
      backgroundColor: new Color(240, 224, 214),
    });
    this._outlets["area-draw"].appendChild(this._canvas.element);

    if (isRunnningOnExtension) {
      parseHtml(htmlButtonOpen, this, this._outlets);
      document.body.appendChild(this._outlets["button-open"]);
    }
    else {
      this._root.setAttribute("tabindex", "-1");
      this._root.style.width = "100%";
      this._root.style.height = "100%";
      this._outlets["button-close"].style.display = "none"
    }

    document.body.appendChild(this._root);

    this._paletteForeColor = new ColorPicker(this._root);
    this._paletteForeColor.setPalette(defaultPalette);
    this._paletteBackgroundColor = new ColorPicker(this._root);
    this._paletteBackgroundColor.setPalette(defaultPalette);
    this._palettePenSize = new SizeSelector(this._root, this._state.penSize.value);

    this.resetStatus();
    
    this.init();
    this.bind();
  }

  /**
   * 各イベントリスナー登録
   */
  init() {
    const win = this._window;
    let _activePointer: number | null = null;
    // タイトルバードラッグ処理
    {
      let _dragStartPosition = {x: 0, y: 0};
      let _pointerOffset = {x: 0, y: 0};
      const titlebar = this._outlets["titlebar"];
      titlebar.innerText = `手書き v${manifest.version}`;
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
    // リサイズ ドラッグ処理
    {
      const resize = this._outlets["resize"];
      let _selector: Selector | null = null;
      let _initialRect: DOMRect = win.getBoundingClientRect();
      let _pointerOffset = {x: 0, y: 0};
      resize.addEventListener("pointerdown", (ev: PointerEvent) => {
        if (_activePointer != null) {
          return;
        }
        _activePointer = ev.pointerId;
        resize.setPointerCapture(_activePointer);

        _initialRect = win.getBoundingClientRect();
        _pointerOffset.x = ev.clientX - _initialRect.right;
        _pointerOffset.y = ev.clientY - _initialRect.bottom;

        _selector = new Selector();
        _selector.select(
          _initialRect.left, _initialRect.top,
          _initialRect.right, _initialRect.bottom
        )
      });
      resize.addEventListener("pointermove", (ev: PointerEvent) => {
        if (ev.pointerId != _activePointer) {
          return;
        }
        let right = clamp(ev.clientX - _pointerOffset.x, 0, window.innerWidth);
        let bottom = clamp(ev.clientY - _pointerOffset.y, 0, window.innerHeight);
        // 右下座標の増分
        let dw = right - _initialRect.right;
        let dh = bottom - _initialRect.bottom;
        // リサイズ後のキャンバスサイズの計算
        let cw = Math.max(
            this._canvas.width + dw/this._canvas.scale,
            MIN_CANVAS_WIDTH
        ) | 0;
        let ch = Math.max(
            this._canvas.height + dh/this._canvas.scale,
            MIN_CANVAS_HEIGHT
        ) | 0;
        // dw, dh　を再計算
        dw = (cw - this._canvas.width)*this._canvas.scale;
        dh = (ch - this._canvas.height)*this._canvas.scale;

        _selector?.select(
          _initialRect.x, _initialRect.y,
          _initialRect.right + dw, _initialRect.bottom + dh
        );

        this.showStatus(`w${this._canvas.width}:h${this._canvas.height} → w${cw}:h${ch}`);
      });
      resize.addEventListener("pointerup", (ev: PointerEvent) => {
        if (_activePointer == ev.pointerId) {
          resize.setPointerCapture(_activePointer);
          _activePointer = null;
        }
        let right = clamp(ev.clientX - _pointerOffset.x, 0, window.innerWidth);
        let bottom = clamp(ev.clientY - _pointerOffset.y, 0, window.innerHeight);
        // 右下座標の増分
        let dw = right - _initialRect.right;
        let dh = bottom - _initialRect.bottom;
        // リサイズ後のキャンバスサイズの計算
        let cw = Math.max(
            this._canvas.width + dw/this._canvas.scale,
            MIN_CANVAS_WIDTH
        ) | 0;
        let ch = Math.max(
            this._canvas.height + dh/this._canvas.scale,
            MIN_CANVAS_HEIGHT
        ) | 0;
        if (cw != this._canvas.width || ch != this._canvas.height) {
          this._canvas.resize(cw, ch);
        }
        this.resetStatus();
        _selector?.close();
      });
      resize.addEventListener("pointercancel", (ev: PointerEvent) => {
        if (_activePointer != null) {
          resize.setPointerCapture(_activePointer);
        }
        _activePointer = null;
        this.resetStatus();
        _selector?.close();
      });
    }

    // ブラウザウィンドウ関連イベント処理
    window.addEventListener("resize", (ev) => {
      this.adjustWindow();
    });
    window.addEventListener("blur", (ev) => {
      this.onBlur(ev);
    });
    if (!isRunnningOnExtension) {
      window.addEventListener("focus", (ev) => {
        this._root.focus();
      });
    }

    /**
     * デフォルトのタッチ操作制御
     */
    this._root.addEventListener("touchstart", (ev: TouchEvent) => {
      if (ev.touches && ev.touches.length > 1) {
        ev.preventDefault();
      }
    }, {passive: false});
    this._root.addEventListener("touchmove", (ev: TouchEvent) => {
      if (ev.touches && ev.touches.length > 1) {
        ev.preventDefault();
      }
    }, {passive: false});
  }

  /**
   * ObservableValue と View 間のバインド
   */
  bind() {
    // Connect ObservableValue to views
    // PenMode
    this._state.penMode.addObserver(this, "change", (val: PenMode) => {
      // ツールアイコン切替
      for (const name of ["pen", "eraser"]) {
        const icon = this._outlets[`icon-${name}`] as HTMLImageElement;
        const active = val == name ? "active" : "deactive";
        icon.src = getAssetUrl(`asset/tool-${name}-${active}.png`);
      }
      this.onUpdateToolSize();

      this._canvas.state.penMode = val;
    });
    this._state.penMode.sync();

    // PenSize
    this._state.penSize.addObserver(this, "change", (val: number) => {
      this._canvas.state.penSize = val;
      this.onUpdateToolSize();
    });
    this._state.penSize.sync();

    // EraserSize
    this._state.eraserSize.addObserver(this, "change", (val: number) => {
      this._canvas.state.eraserSize = val;
      this.onUpdateToolSize();
    });
    this._state.eraserSize.sync();

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
      if (this._state.penMode.value == "pen") {
        this._state.penSize.value = n;
      }
      else {
        this._state.eraserSize.value = n;
      }
    });
    
    // キャンバスサイズ更新後
    this._canvas.addObserver(this, "size-changed", () => {
      this.resetStatus();
    })
    // サブツールアイコン更新語
    this._canvas.addObserver(this, "change-sub-tool", (subTool: SubTool) => {
      const icon = this._outlets["icon-spoit"] as HTMLImageElement;
      const active = subTool == "spoit" ? "active" : "deactive";
      icon.src = getAssetUrl(`asset/tool-spoit-${active}.png`);
    });
    // Undo, Redo後のアイコン更新
    this._canvas.addObserver(this, "update-history", this.updateUndoRedoIcon);
    this.updateUndoRedoIcon();
    // スポイト後の色更新
    this._canvas.addObserver(this, "spoit", (ev: {tool: PenMode, color: Color.Immutable}) => {
      if (ev.tool == "pen") {
        this._state.foreColor.value = ev.color;
      }
      else {
        this._state.backgroundColor.value = ev.color;
      }
    });
  }

  /**
   * Undo, Redoアイコンの表示更新
   */
  private updateUndoRedoIcon() {
    if (this._canvas.undoLength == 0) {
      this._outlets["tool-undo"].setAttribute("disabled", "");
    }
    else {
      this._outlets["tool-undo"].removeAttribute("disabled");
    }
    if (this._canvas.redoLength == 0) {
      this._outlets["tool-redo"].setAttribute("disabled", "");
    }
    else {
      this._outlets["tool-redo"].removeAttribute("disabled");
    }
  }

  /**
   * 選択中のツールのサイズをViewに反映
   */
  private onUpdateToolSize() {
    let size: number;
    if (this._state.penMode.value == "pen") {
      size = this._state.penSize.value;
    }
    else {
      size = this._state.eraserSize.value;
    }
    this._outlets["tool-size-value"].innerText = size.toString();
    this._palettePenSize.value = size;
  }

  private _resetStatusTimer: number = 0;
  /**
   * 一定時間ステータステキストを表示
   */
  showStatus(text: string, duration: number = 3000) {
    this._outlets["status"].innerText = text;
    clearTimeout(this._resetStatusTimer);
    this._resetStatusTimer = window.setTimeout(() => {
      this.resetStatus();
    }, duration);
  }

  /**
   * 標準のステータステキスト
   */
  defaultStatusText() {
    return `w${this._canvas.width}:h${this._canvas.height}　倍率x${this._canvas.scale.toPrecision(2)}`;
  }

  /**
   * ステータステキスト表示の更新
   */
  resetStatus() {
    clearTimeout(this._resetStatusTimer);
    this._outlets["status"].innerText = this.defaultStatusText();
  }

  /**
   * キャンバスを初期状態にリセット
   */
  resetCanvas() {
    this._state.foreColor.value = canvasInitialState.foreColor;
    this._state.backgroundColor.value = canvasInitialState.backgroundColor;
    this._state.penSize.value = canvasInitialState.penSize;
    this._state.eraserSize.value = canvasInitialState.eraserSize;
    this._state.penMode.value = "pen";
    this._canvas.resize(canvasInitialState.width, canvasInitialState.height);
    this._canvas.fillWithBackgroundColor();
  }

  open(x?: number, y?: number) {
    const win = this._window;
    win.style.display = "block";

    if (typeof x === "undefined" || typeof y === "undefined") {
      x = document.body.clientWidth/2 - win.clientWidth/2;
      y = document.body.clientHeight/2 - win.clientHeight/2
    }

    win.style.left = `${x}px`;
    win.style.top = `${y}px`;
    win.focus();
  }

  // --------------------------------------------------
  // イベントハンドラ定義
  // --------------------------------------------------

  onClickNew(ev: Event) {
    this.resetCanvas();
  }
  
  onClickSave(ev: Event) {
    this._canvas.download();
  }

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
    this.adjustWindow();

    this.resetStatus();
  }

  onClickOpen(ev: Event) {
    const win = this._window;
    const d = win.style.display;
    if (d != "block") {
      this.open();
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

  onClickEraser(ev: Event) {
    this._state.penMode.value = "eraser";
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

  onClickSpoit(ev: Event) {
    if (this._canvas.state.subTool == "spoit") {
      this._canvas.state.subTool = "none";
    }
    else {
      this._canvas.state.subTool = "spoit";
    }
  }

  onClickClear(ev: Event) {
    this._canvas.fillWithBackgroundColor();
  }

  onClickFill(ev: Event) {
    this._canvas.fill();
  }

  onClickFlip(ev: Event) {
    this._canvas.flip();
  }

  async onClickCopy(ev?: Event): Promise<void> {
    await this._canvas.copyToClipboard();
    this.showStatus("クリップボードにコピーしました");
  }

  onClickUndo(ev: Event) {
    this._canvas.undo();
  }

  onClickRedo(ev: Event) {
    this._canvas.redo();
  }

  onBlur(ev: Event) {
    this._canvas.state.subTool = "none";
    this._keyDownTime.clear();
  }

  onKeydown(ev: KeyboardEvent) {
    // Discord側にイベントを吸われないように
    ev.stopPropagation();

    if (ev.repeat) {
      return;
    }

    // Undo & Redo
    if (ev.ctrlKey) {
      if (ev.key == "z") {
        this._canvas.undo();
      }
      else if (ev.key == "y") {
        this._canvas.redo();
      }
      else if (ev.key == "c") {
        this.onClickCopy();
      }
      return;
    }
    
    // Change tool
    if (ev.key == "e" && this._state.penMode.value != "eraser") {
      this._state.penMode.value = "eraser";
      this._keyDownTime.set("e", Date.now());
    }
    else if (ev.key == "n" && this._state.penMode.value != "pen") {
      this._state.penMode.value = "pen";
      this._keyDownTime.set("n", Date.now());
    }
    else if (ev.key == "Alt") {
      ev.preventDefault();
      this._canvas.state.subTool = "spoit";
    }
  }

  onKeyup(ev: KeyboardEvent) {
    if (ev.key == "Alt" && this._canvas.state.subTool == "spoit") {
      this._canvas.state.subTool = "none";
    }
    if (ev.key == "e") {
      const downTime = this._keyDownTime.get("e");
      this._keyDownTime.delete("e");
      if (typeof downTime == "undefined" || Date.now() - downTime < 500) {
        return;
      }
      this._state.penMode.value = "pen";
    }
    else if (ev.key == "n") {
      const downTime = this._keyDownTime.get("n");
      this._keyDownTime.delete("n");
      if (typeof downTime == "undefined" || Date.now() - downTime < 500) {
        return;
      }
      this._state.penMode.value = "eraser";
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
    return Math.min(
      (window.innerWidth - WINDOW_CANVAS_PADDING_H)/this._canvas.width,
      (window.innerHeight - WINDOW_CANVAS_PADDING_V)/this._canvas.height
    );
  }
}

if (
  (! isRunnningOnExtension) || 
  location.href.startsWith("https://discord.com/app") ||
  location.href.startsWith("https://discord.com/channels")
) {
  const app = new DiscordTegaki();
  if (! isRunnningOnExtension) {
    app.open(0, 0);
  }

  console.log("[Discord Tegaki]launched");
}
