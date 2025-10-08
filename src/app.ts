import htmlWindow from "raw-loader!./window.html";
import htmlButtonOpen from "raw-loader!./button-open.html";

import TegakiCanvas from "./tegaki-canvas";
import CanvasTool from "./canvas-tool";
import { parseHtml, Outlets } from "./dom";
import { ObservableColor, ObservableValue } from "./foudantion/observable-value";
import Color from "./foudantion/color";
import PanelColor from "./panel/color";
import SizeSelector from "./panel/size-selector";
import Selector from "./selector";
import { clamp, createCanvas2D, isRunnningOnExtension } from "./funcs";
import defaultPalette from "./default-palette";
import { getAssetUrl } from "./asset";
import PanelLayer from "./panel/layer";

import manifest from "../manifest.json";
import "./scss/main.scss";
import PanelBucket from "./panel/bucket";
import storage from "./storage";
import TegakiCanvasDocument from "./canvas-document";
import { JsonObject, parse } from "./foudantion/json";
import shortcut from "./shortcut";
import View from "./foudantion/view";
import WebGLFilter from "./webgl-filter";
import ApplicationSettings, { ApplicationSettingsInit } from "./settings";
import PanelSettings from "./panel/settings";

const DEFAULT_CANVAS_WIDTH = 344;
const DEFAULT_CANVAS_HEIGHT = 135;

const MIN_CANVAS_WIDTH = 344;
const MIN_CANVAS_HEIGHT = 135;

/**
 * キャンバスとウィンドウの横幅の差
 */
const WINDOW_CANVAS_PADDING_H = 84;
const WINDOW_CANVAS_PADDING_V = 73;

export type CanvasInitialState = {
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

export class State {
  readonly tool: ObservableValue<CanvasTool> = new ObservableValue(CanvasTool.none);
  readonly backgroundColor: ObservableColor = new ObservableColor(240, 224, 214);
}

// ウィンドウ上のツール名一覧
const toolIcons = [
  "pen",
  "eraser",
  "spoit",
  "bucket",
  "select",
];

class LineSizeDisplay extends View {
  #element: HTMLCanvasElement;
  #context: CanvasRenderingContext2D;
  #value: number = 1;
  constructor() {
    super();
    const c = createCanvas2D(24, 24);
    this.#element = c.canvas;
    this.#context = c.context;
  }

  get element() {
    return this.#element;
  }

  set value(value: number) {
    if (this.#value == value) {
      return;
    }
    this.#value = value;
    this.render();
  }

  render() {
    const ctx = this.#context;
    ctx.clearRect(0, 0, 24, 24);
    if (this.#value <= 0) {
      return;
    }
    ctx.fillStyle = "#300";
    const offset = this.#value%2 == 0 ? 0 : 0.5;
    ctx.fillRect(0, 12 - this.#value/2 + offset, 24, this.#value);
    ctx.font = "14px caption";
    const s = this.#value.toString();
    const m = ctx.measureText(s);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#300";
    ctx.fillStyle = "white";
    ctx.textBaseline = "middle";
    ctx.strokeText(s, 12 - m.width/2, 12);
    ctx.fillText(s, 12 - m.width/2, 12);
  }

}

export class DiscordTegaki {
  private _outlets: Outlets;
  private _canvas: TegakiCanvas;
  private _state: State;
  private _settings: ApplicationSettings;

  private _panelColor: PanelColor;
  private _palettePenSize: SizeSelector;
  private _panelLayer: PanelLayer;
  private _panelBucket: PanelBucket;
  private _panelSettings: PanelSettings;
  private _lineSizeDisplay: LineSizeDisplay = new LineSizeDisplay();

  private _root: HTMLElement;
  private _window: HTMLElement;
  private _shortcutDownTime: Map<shortcut.Shortcut, number> = new Map();

  private _toolPen = new CanvasTool.Blush(
    "pen", canvasInitialState.penSize
  );
  private _toolEraser = new CanvasTool.Blush(
    "eraser", canvasInitialState.eraserSize
  );
  private _toolSpoit = new CanvasTool.Spoit();
  private _toolBucket = new CanvasTool.Bucket();
  private _toolSelect = new CanvasTool.Select();
  private _previousTool: CanvasTool = CanvasTool.none;
  private _nextPreviousTool: CanvasTool = CanvasTool.none;

  private _autoSaveInterval: number = 5; // Minutes
  private _autoSaveTimer: number = 0;

  constructor(settings: ApplicationSettingsInit | null) {
    this._settings = new ApplicationSettings(settings || ApplicationSettings.initialSettings);
    this._state = new State();
    this._state.tool.value = this._toolPen;
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

    // "開く" ボタン表示
    if (isRunnningOnExtension) {
      parseHtml(htmlButtonOpen, this, this._outlets);
      document.body.appendChild(this._outlets["button-open"]);
    }
    // Webアプリ版向け調整
    /*
    else {
      this._root.setAttribute("tabindex", "-1");
      this._root.style.width = "100%";
      this._root.style.height = "100%";
      this._outlets["button-close"].style.display = "none";
    }
    */
    // Webkit向け調整
    if (typeof this._canvas.context.filter === "undefined") {
      try {
        WebGLFilter.init();
      }
      catch {
        this._outlets["tool-bucket"].style.visibility = "hidden";
      }
    }

    document.body.appendChild(this._root);
    this._outlets["tool-size"].appendChild(this._lineSizeDisplay.element);

    this._panelColor = new PanelColor(this._root);
    this._panelColor.setPalette(defaultPalette);
    this._palettePenSize = new SizeSelector(this._root, 1);
    this._panelLayer = new PanelLayer(this._root, this._canvas);
    this._panelBucket = new PanelBucket(this._root, this._toolBucket);
    this._panelSettings = new PanelSettings(this._root, this._settings);

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
        let right = clamp(ev.clientX - _pointerOffset.x, 0, document.documentElement.clientWidth);
        let bottom = clamp(ev.clientY - _pointerOffset.y, 0, document.documentElement.clientHeight);
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
        let right = clamp(ev.clientX - _pointerOffset.x, 0, document.documentElement.clientWidth);
        let bottom = clamp(ev.clientY - _pointerOffset.y, 0, document.documentElement.clientHeight);
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

    this._root.addEventListener("wheel", (ev: WheelEvent) => {
    }, {passive: false});
    this._root.addEventListener("dragstart", (ev: DragEvent) => {
      ev.preventDefault();
    },);
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
    // ツール
    this._state.tool.addObserver(this, "change", (tool: CanvasTool) => {
      this._previousTool = this._nextPreviousTool;
      this._nextPreviousTool = tool;
      
      // ツールアイコン切替
      for (const name of toolIcons) {
        const icon = this._outlets[`tool-${name}`] as HTMLImageElement;
        if (name == tool.name) {
          icon.setAttribute("data-active", "");
        }
        else {
          icon.removeAttribute("data-active");
        }
      }
      this.onUpdateToolSize();

      this._canvas.currentTool = tool;
    });
    this._state.tool.sync();

    // Fore Color
    this._canvas.observable.foreColor.addObserver(this, "change", (value: Color.Immutable) => {
      this._outlets["foreColor"].style.backgroundColor = value.css();
    });
    this._canvas.observable.foreColor.sync();

    // Background Color
    this._state.backgroundColor.addObserver(this, "change", (value: Color.Immutable) => {
      this._outlets["backgroundColor"].style.backgroundColor = value.css();
      this._canvas.changeBackgroundColor(value);
      this._canvas.requestRender();
    });
    this._canvas.addObserver(this, "change-background-color", (value) => {
      this._state.backgroundColor.value = value;
    });
    this._state.backgroundColor.sync();

    // Settings to Canvas
    this._settings.observables.undoMax.addObserver(this, "change", (value) => {
      this._canvas.undoMax = value;
    });
    this._settings.observables.strokeMergeTime.addObserver(this, "change", (value) => {
      this._canvas.strokeMergeTime = value;
    });
    this._settings.addObserver(this, "change", () => {
      const data = this._settings.serialize();
      storage.local.set("tegaki-settings", data);
    });
    this._settings.sync();
    
    // Connect palette to ObservableValue
    this._palettePenSize.addObserver(this, "change", (n: number) => {
      console.log(n);
      this._state.tool.value.size = n;
      this.onUpdateToolSize();
    });
    
    // キャンバスサイズツール変更後
    this._canvas.addObserver(this, "change-tool", (tool) => {
      this._state.tool.value = tool;
    })
    // キャンバスサイズ更新後
    this._canvas.addObserver(this, "change-size", () => {
      this.resetStatus();
      this.adjustWindow();
    })
    // キャンバス操作後
    this._canvas.addObserver(this, "update-history", () => {
      this.updateUndoRedoIcon();
      this.prepareAutoSave();
    });
    this.updateUndoRedoIcon();
    // ページクローズ時自動保存
    document.addEventListener("visibilitychange", () => {
      this.onQuit();
    });
    // スポイト後の色更新
    this._canvas.addObserver(this, "spoit", (ev: {color: Color.Immutable}) => {
      console.log();
      this._canvas.foreColor = ev.color;
    });
  }

  prepareAutoSave() {
    if (this._autoSaveTimer != 0 || this._autoSaveInterval <= 0) {
      return;
    }

    this._autoSaveTimer = window.setTimeout(async () => {
      await this.autoSave();
      this._autoSaveTimer = 0;
    }, this._autoSaveInterval*60*1000);
  }

  async forceAutoSave() {
    if (this._autoSaveTimer == 0) {
      return;
    }
    await this.autoSave();
    this._autoSaveTimer = 0;
  }

  async autoSave() {
    const data = this._canvas.document.serialize();
    await storage.local.set("tegaki-autosave", data);
    this.showStatus("自動保存されました", 2000);
  }

  async clearAutoSave() {
    window.clearTimeout(this._autoSaveTimer);
    this._autoSaveTimer = 0;
    await storage.local.remove("tegaki-autosave");
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
    let size: number = this._state.tool.value.size;
    if (this._state.tool.value.resizeable) {
      this._lineSizeDisplay.value = size;
      this._outlets["tool-size"].removeAttribute("disabled");
    }
    else {
      this._lineSizeDisplay.value = 0;
      this._outlets["tool-size"].setAttribute("disabled", "");
    }
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
   * ステータステキスト表示のリセット
   */
  resetStatus() {
    clearTimeout(this._resetStatusTimer);
    this._outlets["status"].innerText = this.defaultStatusText();
  }

  /**
   * キャンバスを初期状態にリセット
   */
  resetCanvas() {
    this._state.tool.value = this._toolPen;
    this._canvas.reset(canvasInitialState.width, canvasInitialState.height, canvasInitialState.backgroundColor);
    this.onUpdateToolSize();
  }

  #initPhase : "none" | "initializing" | "initialized" = "none";
  /**
   * アプリケーションウィンドウを開く。
   * 初回は初期化処理が走る。
   * @param x
   * @param y
   * @returns 
   */
  async open(x?: number, y?: number) {
    if (this.#initPhase == "initializing") {
      return;
    }
    else if (this.#initPhase == "none") {
      const data = await storage.local.get("tegaki-autosave");
      if (data != null) {
        this.#initPhase = "initializing";
        try {
          parse(data, TegakiCanvasDocument.structure);
          const doc = await TegakiCanvasDocument.deserialize(data as JsonObject); 
          this._canvas.document = doc;
        }
        catch (err: any) {
          console.warn(err);
        }
      }
    }
    this.#initPhase = "initialized";

    const win = this._window;
    win.style.display = "block";

    if (
      (typeof x === "undefined" || typeof y === "undefined") &&
      win.style.left == ""
    ) {
      x = document.documentElement.clientWidth/2 - win.clientWidth/2;
      y = document.documentElement.clientHeight/2 - win.clientHeight/2
      win.style.left = `${x}px`;
      win.style.top = `${y}px`;
    }
    else {
      win.style.left = `${x}px`;
      win.style.top = `${y}px`;
    }
    win.focus();
    this.adjustWindow();
  }

  close() {
    this._window.style.display = "none";
  }

  // --------------------------------------------------
  // イベントハンドラ定義
  // --------------------------------------------------

  onQuit() {
    this.forceAutoSave();
  }

  onClickNew(ev: Event) {
    this.resetCanvas();
  }
  
  onClickSave(ev: Event) {
    this._canvas.download();
    this.clearAutoSave();
  }

  onClickSettings(ev: Event) {
    const e = ev.target as HTMLElement;
    const r = e.getBoundingClientRect();
    this._panelSettings.open(r.right, r.y);
    ev.stopPropagation();
    ev.preventDefault();
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
    this._panelLayer.close();
  }

  onClickPen(ev: PointerEvent) {
    this._state.tool.value = this._toolPen;
  }

  onClickEraser(ev: PointerEvent) {
    this._state.tool.value = this._toolEraser;
  }

  onClickPenSize(ev: PointerEvent) {
    if (! this._state.tool.value.resizeable) {
      return;
    }

    ev.stopPropagation();
    ev.preventDefault();

    const e = ev.target as HTMLElement;
    const r = e.getBoundingClientRect();
    this._palettePenSize.open(r.right, r.y);
  }

  onClickForeColor(ev: PointerEvent) {
    ev.stopPropagation();
    ev.preventDefault();

    this._panelColor.close();
    this._panelColor.bind(this._canvas.observable.foreColor);
    this._panelColor.addObserver(this, "close", () => {
      this._panelColor.removeObserver(this);
      this._panelColor.bind(null);
    });

    const e = ev.target as HTMLElement;
    const r = e.getBoundingClientRect();
    this._panelColor.open(r.right, r.y);
  }

  onClickBackgroundColor(ev: PointerEvent) {
    ev.stopPropagation();
    ev.preventDefault();

    this._panelColor.close();
    this._panelColor.bind(this._state.backgroundColor);
    this._panelColor.addObserver(this, "close", () => {
      this._panelColor.removeObserver(this);
      this._panelColor.bind(null);
    });

    const e = ev.target as HTMLElement;
    const r = e.getBoundingClientRect();
    this._panelColor.open(r.right, r.y);
  }

  onClickSpoit(ev: Event) {
    this._state.tool.value = this._toolSpoit;
  }

  onClickBucket(ev: PointerEvent) {
    if (this._state.tool.value == this._toolBucket) {
      const e = ev.target as HTMLElement;
      const r = e.getBoundingClientRect();
      this._panelBucket.open(r.right, r.y);
      ev.stopPropagation();
      ev.preventDefault();
    }
    else {
      this._state.tool.value = this._toolBucket;
    }
  }

  onClickSelect(ev: PointerEvent) {
    if (this._state.tool.value == this._toolSelect) {
      this._canvas.selectNew(null);
    }
    else {
      this._state.tool.value = this._toolSelect;
    }
  }

  onClickClear(ev: Event) {
    this._canvas.clear();
  }

  onClickFill(ev: Event) {
    this._canvas.fill(this._canvas.foreColor);
  }

  onClickFlip(ev: Event) {
    this._canvas.flip();
  }

  async onClickCopy(ev?: Event): Promise<void> {
    await this._canvas.copyToClipboard();
    this.showStatus("クリップボードにコピーしました");
    this.clearAutoSave();
  }

  onClickUndo(ev: Event) {
    this._canvas.undo();
  }

  onClickRedo(ev: Event) {
    this._canvas.redo();
  }

  onClickLayer(ev: MouseEvent) {
    const rect = this._window.getBoundingClientRect();
    this._panelLayer.toggle(rect.right + 1, rect.top);
  }

  onBlur(ev: Event) {
    for (const [key, time] of this._shortcutDownTime) {
      this.endShortcut(key, time);
    }
    this._shortcutDownTime.clear();
  }

  onKeydown(ev: KeyboardEvent) {
    // Discord側にイベントを吸われないように
    ev.stopPropagation();

    // 該当するショートカットを検索
    const sc = shortcut.match(ev);
    if (sc == null) {
      return;
    }

    ev.preventDefault();
    const t = Date.now();
    const accepted = this.onShortcut(sc);
    if (accepted === false) {
      return;
    }
    this._shortcutDownTime.set(sc, t);
  }

  /**
   * ショートカット処理の実行
   * @param sc 実行するショートカット
   * @returns 処理が無効な場合に false. 例えば既に選択中のツールに切り替えようとした等
   */
  onShortcut(sc: shortcut.Shortcut): boolean | undefined {
    switch (sc.name) {
      case "undo": {
        this._canvas.undo();
        break;
      }
      case "redo": {
        this._canvas.redo();
        break;
      }
      case "copy": {
        this.onClickCopy();
        break;
      }
      case "select-all": {
        this._canvas.selectAll();
        break;
      }
      case "deselect": {
        this._canvas.selectNew(null);
        break;
      }
      case "clear": {
        if (this._canvas.selectedRegion !== null) {
          this._canvas.clear();
        }
        break;
      }
      // Tools
      case "pencil": {
        if (this._state.tool.value == this._toolPen) {
          return false;
        }
        this._state.tool.value = this._toolPen;
        break;
      }
      case "eraser": {
        if (this._state.tool.value == this._toolEraser) {
          return false;
        }
        this._state.tool.value = this._toolEraser;
        break;
      }
      case "spoit": {
        if (this._state.tool.value == this._toolSpoit) {
          return false;
        }
        this._state.tool.value = this._toolSpoit;
        break;
      }
      case "bucket": {
        if (this._state.tool.value == this._toolBucket) {
          return false;
        }
        this._state.tool.value = this._toolBucket;
        break;
      }
      case "select": {
        if (this._state.tool.value == this._toolSelect) {
          return false;
        }
        this._state.tool.value = this._toolSelect;
        break;
      }
      // Move
      case "move-up": {
        this._canvas.selectMove(0, -1);
        break;
      }
      case "move-down": {
        this._canvas.selectMove(0, 1);
        break;
      }
      case "move-left": {
        this._canvas.selectMove(-1, 0);
        break;
      }
      case "move-right": {
        this._canvas.selectMove(1, 0);
        break;
      }
      // Move Fast
      case "move-fast-up": {
        this._canvas.selectMove(0, -10);
        break;
      }
      case "move-fast-down": {
        this._canvas.selectMove(0, 10);
        break;
      }
      case "move-fast-left": {
        this._canvas.selectMove(-10, 0);
        break;
      }
      case "move-fast-right": {
        this._canvas.selectMove(10, 0);
        break;
      }
      // Grab Move
      case "grab-up": {
        this._canvas.selectGrabMove(0, -1);
        break;
      }
      case "grab-down": {
        this._canvas.selectGrabMove(0, 1);
        break;
      }
      case "grab-left": {
        this._canvas.selectGrabMove(-1, 0);
        break;
      }
      case "grab-right": {
        this._canvas.selectGrabMove(1, 0);
        break;
      }
    }
  }

  onKeyup(ev: KeyboardEvent) {
    this._onKeyUp(ev.key);
  }
  private _onKeyUp(key: string) {
    for (let [sc, time] of this._shortcutDownTime) {
      if (sc.key != key) {
        return;
      }
      this.endShortcut(sc, time);
      this._shortcutDownTime.delete(sc);
    }
  }

  endShortcut(sc: shortcut.Shortcut, startTime: number) {
    const now = Date.now();
    if (
      sc.mode == "Temporary" ||
      (sc.mode == "PressTemp" && now - startTime > 300)
    ) {
      this._state.tool.value = this._previousTool;
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
    else if (rect.right > document.documentElement.clientWidth) {
      win.style.left = `${document.documentElement.clientWidth - rect.width}px`;
    }
    if (rect.y < 0) {
      win.style.top = "0";
    }
    else if (rect.bottom > document.documentElement.clientHeight) {
      win.style.top = `${document.documentElement.clientHeight - rect.height}px`;
    }
  }

  /**
   * キャンバスの表示できる最大倍率
   */
  maxCanvasScale() {
    return Math.max(1, Math.min(
      (document.documentElement.clientWidth - WINDOW_CANVAS_PADDING_H)/this._canvas.width,
      (document.documentElement.clientHeight - WINDOW_CANVAS_PADDING_V)/this._canvas.height
    ));
  }

  /**
   * 閉じるボタンの無効化
   */
  disableClose() {
    this._outlets["button-close"].style.display = "none";
  }
  
  static async launch() {
    const settings = await ApplicationSettings.load("tegaki-settings");
    const app = new DiscordTegaki(settings);
    return app;
  }
}
