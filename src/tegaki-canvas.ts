import Stack from "./foudantion/stack";
import Color from "./foudantion/color";
import Subject from "./foudantion/subject";

import svgFilterCode from "raw-loader!./svg-filter.svg";

import { parseSvg } from "./dom";
import { getAssetUrl } from "./asset";
import Offscreen from "./canvas-offscreen";
import CanvasAction, { BrushPath, BrushState, drawPath, getPathBoundingRect } from "./canvas-action";
import { Rect } from "./foudantion/rect";
import StrokeManager from "./stroke-manager";
import { Layer } from "./canvas-layer";
import TegakiCanvasDocument from "./canvas-document";
import { ObservableColor, ObservableValue } from "./foudantion/observable-value";
import CanvasTool from "./canvas-tool";
import { clamp, getConnectedPixels } from "./funcs";
import ObjectPool from "./foudantion/object-pool";
import SvgFilter from "./svg-filter";
import CanvasRegion from "./canvas-region";
import WebGLFilter from "./webgl-filter";

function createOffscreenCanvas(width: number, height: number) {
  if (typeof window["OffscreenCanvas"] === "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;    
  }
  else {
    return new OffscreenCanvas(width, height);
  }
}

// カーソル描画用のフィルタの読み込み
const svgFilter = parseSvg(svgFilterCode);
document.body.appendChild(svgFilter);

/**
 * キャンバス作成時のパラメータ
 */
export type CanvasInit = {
  width: number,
  height: number,
  foreColor: Color.Immutable,
  backgroundColor: Color.Immutable
};

/**
 * バケツ塗りのオプション
 */
export type BucketOption = {
  /** 色許容誤差 */
  tolerance?: number;
  /** 隙間閉じ */
  closeGap?: number;
  /** 領域拡張 */
  expand?: number;
  /** 透明度 */
  opacity?: number;
};

const offscreenPool = ObjectPool.sharedPoolFor(Offscreen);

const toolCursors: {[tool: string]: {cursor: string}} = {
  "grab": {cursor: "grab"},
  "spoit": {cursor: `url(${getAssetUrl("cursor-spoit.png")}) 1 14, auto`},
  "bucket": {cursor: `url(${getAssetUrl("cursor-bucket.png")}) 2 12, auto`},
  "prohibit": {cursor: `url(${getAssetUrl("cursor-prohibit.png")}) 7 7, auto`},
  "select": {cursor: `url(${getAssetUrl("cursor-select.png")}) 7 7, auto`},
}

/**
 * 操作履歴
 */
class HistoryNode {
  /** 実行するアクション */
  action: CanvasAction;
  /** 取り消し時のアクション */
  undo: CanvasAction;
  /** 操作時刻 */
  time: number = Date.now();

  constructor(action: CanvasAction, undo: CanvasAction) {
    this.action = action;
    this.undo = undo;
  }

  /** 履歴から破棄される時の処理 */
  dispose() {
    this.action.dispose();
    this.undo.dispose();
  }

  /**
   * 操作履歴を結合して1つにまとめたものを作成して返す. 結合が不可能だった場合は undefined が返る.
   */
  mergeWith(node: HistoryNode, strokeMergeTime: number): HistoryNode | undefined {
    const a0 = node.action;
    const a1 = this.action;
    const u0 = node.undo;
    const u1 = this.undo;
    const mergeTime = 3000;
    if (node.time - this.time < mergeTime) {
      // レイヤー透明度
      if (
        a0 instanceof CanvasAction.ChangeLayerOpacity &&
        a1 instanceof CanvasAction.ChangeLayerOpacity &&
        u0 instanceof CanvasAction.ChangeLayerOpacity &&
        u1 instanceof CanvasAction.ChangeLayerOpacity &&
        a0.layer == a1.layer
      ) {
        return new HistoryNode(
          new CanvasAction.ChangeLayerOpacity(a0.canvas, a0.layer, a1.opacity),
          new CanvasAction.ChangeLayerOpacity(a0.canvas, a0.layer, u0.opacity)
        );
      }
      // 背景色
      else if (
        a0 instanceof CanvasAction.ChangeBackgroundColor &&
        a1 instanceof CanvasAction.ChangeBackgroundColor &&
        u0 instanceof CanvasAction.ChangeBackgroundColor &&
        u1 instanceof CanvasAction.ChangeBackgroundColor
      ) {
        return new HistoryNode(
          new CanvasAction.ChangeBackgroundColor(a0.canvas, a1.color),
          new CanvasAction.ChangeBackgroundColor(a0.canvas, u0.color)
        );
      }
      // 選択範囲移動
      else if (
        a0 instanceof CanvasAction.SelectMove &&
        a1 instanceof CanvasAction.SelectMove &&
        u0 instanceof CanvasAction.SelectMove &&
        u1 instanceof CanvasAction.SelectMove
      ) {
        const dx = a0.x + a1.x;
        const dy = a0.y + a1.y;
        return new HistoryNode(
          new CanvasAction.SelectMove(a0.canvas, dx, dy),
          new CanvasAction.SelectMove(a0.canvas, -dx, -dy)
        );
      }
    }
    // ストローク
    if (
      a0 instanceof CanvasAction.DrawPath &&
      a1 instanceof CanvasAction.DrawPath &&
      a1.startTime - a0.finishTime <= strokeMergeTime &&
      a0.layer == a1.layer
    ) {
      const action = new CanvasAction.Merge(a0, a1);
      const undo = new CanvasAction.Merge(u1, u0);
      return new HistoryNode(action, undo);
    }
    else if (
      a0 instanceof CanvasAction.Merge &&
      a1 instanceof CanvasAction.DrawPath &&
      u0 instanceof CanvasAction.Merge &&
      a0.last instanceof CanvasAction.DrawPath &&
      a1.startTime - a0.last.finishTime <= strokeMergeTime &&
      a0.last.layer == a1.layer
    ) {
      a0.add(a1);
      u0.unshift(u1);
      return new HistoryNode(a0, u0);
    }
  }
};

export class TegakiCanvas extends Subject {
  readonly element: HTMLDivElement;
  /** カーソル描画用 かつ Pointイベントを受け付ける Canvas */
  readonly cursorOverlay: HTMLCanvasElement;
  readonly cursorContext: CanvasRenderingContext2D;
  /** 画像表示先の Canvas */
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;

  /** 選択中のツール */
  private _currentTool: CanvasTool = CanvasTool.none;
  /**
   * ストローク終了後のツール. ストローク中にツールの変更要求があった場合に
   * すぐに変更せず、ストロークが終了するまで待つために使う.
   */
  private _nextTool: CanvasTool | null = null;

  /**
   * 内部スケール. 見た目の表示よりも解像度を大きくすることで
   * アンチエイリアスが綺麗に働くようにしたい場合に設定.
   */
  private _innerScale: number;

  /**
   * 画像描画用のオフスクリーンバッファ
   */
  private _offscreen: Offscreen;
  /**
   * 現在選択中のレイヤーに、スクトーク中の内容を
   * プレビュー表示させるために使う.
   */
  private _currentLayerOffscreen: Offscreen;
  /**
   * キャンバスの表示倍率
   */
  private _scale: number = 1;

  // ペン情報
  private _mouseX: number = 0;
  private _mouseY: number = 0;
  private _isMouseEnter: boolean = false;

  private _activePointerId: number | null = null;

  private _renderCallback: FrameRequestCallback;
  private _renderCursorCallback: FrameRequestCallback;

  private _undoStack: Stack<HistoryNode> = new Stack();
  private _redoStack: Stack<HistoryNode> = new Stack();
  private _undoMax: number = 20;
  private _strokeMergeTime: number = 150;

  private _strokeManager: StrokeManager = new StrokeManager();
  private _spoitContext: OffscreenCanvasRenderingContext2D;

  /** 現在選択されているレイヤーの index */
  private _currentLayerPosition: number = 0;
  /** キャンバス上の選択範囲の情報 */
  private _selectedRegion: CanvasRegion | null = null;
  
  readonly observable: {
    foreColor: ObservableColor;
    document: ObservableValue<TegakiCanvasDocument>;
  };

  constructor(init: CanvasInit) {
    super();

    // Init document
    const doc = new TegakiCanvasDocument(init.width, init.height, [], init.backgroundColor);
    this._innerScale = 1;

    this.observable = {
      document: new ObservableValue<TegakiCanvasDocument>(doc),
      foreColor: (new ObservableColor(255, 255, 255)).set(init.foreColor),
    };

    // Create canvas for image
    this.element = document.createElement("div");
    this.element.className = "dt_r_tegaki-canvas";

    this.canvas = document.createElement("canvas");
    this.canvas.className = "dt_r_layer";
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this._renderCallback = this.render.bind(this);

    const ctx = this.canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("Failed to get CanvasRendering2DContext");
    }
    this.context = ctx;
    
    // Create canvas for cursor
    this.cursorOverlay = document.createElement("canvas");
    this.cursorOverlay.className = "dt_r_cursor";
    this.cursorOverlay.width = this.width;
    this.cursorOverlay.height = this.height;
    this._renderCursorCallback = this.renderCursor.bind(this);

    let cursorCtx = this.cursorOverlay.getContext("2d");
    if (cursorCtx === null) {
      throw new Error("Failed to get CanvasRendering2DContext");
    }
    this.cursorContext = cursorCtx;

    this.element.appendChild(this.canvas);
    this.element.appendChild(this.cursorOverlay);

    this._offscreen = new Offscreen(this.innerWidth, this.innerHeight);
    this._currentLayerOffscreen = new Offscreen(this.innerWidth, this.innerHeight);

    // Create 2D context for spoit
    const spoitCanvas = createOffscreenCanvas(1, 1) as OffscreenCanvas;
    const spoitContext = spoitCanvas.getContext("2d", {willReadFrequently: true});
    if (spoitContext === null) {
      throw new Error("Failed to get CanvasRendering2DContext");
    }
    this._spoitContext = spoitContext;

    const resizeObserver = new ResizeObserver((ev) => this.onResizeElement(ev[0].contentRect.width, ev[0].contentRect.height));
    resizeObserver.observe(this.element);
    
    this.init();
  }

  get document() {
    return this.observable.document.value;
  }
  set document(doc: TegakiCanvasDocument) {
    this.observable.document.value = doc;
    this.updateCanvasSize();
    this.notify("change-document", this.document);
    this.notify("change-background-color", this.backgroundColor);
    this.selectLayerAt(this.document.layers.length - 1);
  }

  get foreColor(): Color.Immutable {
    return this.observable.foreColor.value;
  }
  set foreColor(color: Color.Immutable) {
    this.observable.foreColor.set(color);
  }

  get currentLayer(): Layer {
    return this.document.layers[this._currentLayerPosition];
  }

  get currentLayerPosition(): number {
    return this._currentLayerPosition;
  }

  get selectedRegion(): CanvasRegion | null{
    return this._selectedRegion;
  }
  set selectedRegion(region: CanvasRegion | null) {
    this._selectedRegion = region;
  }

  get strokeManager() {
    return this._strokeManager;
  }

  get strokePath(): BrushPath {
    return this._strokeManager.path;
  }

  get layers(): Layer[] {
    return this.document.layers;
  }

  get currentTool() {
    return this._currentTool;
  }
  set currentTool(tool: CanvasTool) {
    if (this.isDrawing) {
      this._nextTool = tool;
      return;
    }
    if (this._currentTool == tool) {
      return;
    }
    this._currentTool = tool;
    this.requestRenderCursor();
    this.notify("change-tool", this._currentTool);
  }

  get width() {
    return this.document.width;
  }

  get height() {
    return this.document.height;
  }

  setSize(width: number, height: number) {
    if (this.width == width && this.height == height) {
      return;
    }
    this.document.setSize(width, height);
  }

  get backgroundColor(): Color.Immutable {
    return this.document.backgroundColor;
  }

  set backgroundColor(color: Color.Immutable) {
    if (this.document.backgroundColor.equals(color)) {
      return;
    }
    this.document.observables.backgroundColor.set(color);
    this.notify("change-background-color", color);
  }

  /**
   * キャンバスの内部解像度 倍率
   */
  get innerScale() {
    return this._innerScale;
  }
  
  /**
   * キャンバスの内部解像度 横幅
   */
  get innerWidth() {
    return this.width * this._innerScale;
  }
  
  /**
   * キャンバスの内部解像度 高さ
   */
  get innerHeight() {
    return this.height * this._innerScale;
  }

  /**
   * 表示拡大率
   */
  get scale() {
    return this._scale;
  }
  set scale(value: number) {
    if (value <= 0) {
      throw new RangeError("Invalid Argument: scale must be greater than 0.");
    }
    if (this.scale == value) {
      return;
    }
    this._scale = value;
    this.updateCanvasSize();
    this.requestRender();
    this.notify("scale-changed", value);
  }

  /**
   * アンドゥ可能な履歴の数
   */
  get undoLength() {
    return this._undoStack.length;
  }
  /**
   * リドゥ可能な履歴の数
   */
  get redoLength() {
    return this._redoStack.length;
  }

  get undoMax() {
    return this._undoMax;
  }
  set undoMax(value: number) {
    if (value < 0) {
      return;
    }
    this._undoMax = value;
  }

  get strokeMergeTime() {
    return this._strokeMergeTime;
  }
  set strokeMergeTime(value: number) {
    if (value < 0) {
      return;
    }
    this._strokeMergeTime = value;
  }

  /**
   * 選択中ツールのサイズ
   */
  get toolSize() {
    return this._currentTool.size;
  }

  /**
   * 選択中ツールの色
   */
  get toolColor(): Color.Immutable {
    return this.foreColor;
  }

  /**
   * 描画中の状態か
   */
  get isDrawing() {
    return this._activePointerId != null;
  }

  onResizeElement(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.cursorOverlay.width = width;
    this.cursorOverlay.height = height;
    this.requestRender();
    this.requestRenderCursor();
  }

  /**
   * 画像のダウンロード
   */
  download() {
    const a = document.createElement("a");
    const fileName = `tegaki-${Date.now()}.png`;
    a.setAttribute("download", fileName);
    a.setAttribute("href", this._offscreen.canvas.toDataURL());
    a.click();
  }

  /**
   * クリップボードに画像をコピー
   */
  copyToClipboard(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._offscreen.canvas.toBlob((blob) => {
        if (blob == null) {
          reject(new Error("Failed to get blob from canvas"));
          return;
        }

        try {
          const fileName = `tegaki-${Date.now()}.png`;
          const htmlData = `<img src="${fileName}">`;
          navigator.clipboard.write([
            new ClipboardItem({
                "text/html": new Blob([htmlData], {"type": "text/html"}),
                "image/png": blob
            })
          ]);
          resolve();
        }
        catch (err: any) {
          reject(err)
        }
      });
    });

  }
  
  private _needsRenderCursor = false;
  /**
   * カーソル再描画の要求フラグを立てる
   */
  requestRenderCursor() {
    if (this._needsRenderCursor) {
      return;
    }
    this._needsRenderCursor = true;
    requestAnimationFrame(this._renderCursorCallback);
  }

  // カーソルの描画領域
  private _cursorRect = new Rect(0, 0, 0, 0);
  // カーソルとして表示するツール
  private _cursorName = "none";
  /**
   * カーソル描画処理
   */
  renderCursor() {
    this._needsRenderCursor = false;

    const ctx = this.cursorContext;
    ctx.clearRect(
      this._cursorRect.x, this._cursorRect.y,
      this._cursorRect.width, this._cursorRect.height
    );
    
    if (! this._isMouseEnter) {
      this._cursorRect.width = 0;
      return;
    }
    
    let cursorName:  string;
    const isBrushTool = this.currentTool instanceof CanvasTool.Brush;
    const position = this.positionInCanvas(this._mouseX, this._mouseY);

    // Render cursor
    if ((!this.currentLayer.isVisible) && (!this._currentTool.isEnabledForHiddenLayer)) {
      cursorName = "prohibit";
    }
    else {
      cursorName = this._currentTool.cursor(this, position.x, position.y);
    }
    
    if (cursorName == "brush") {
      cursorName = "none";
      const tool = this.currentTool;

      const toolSize = tool.size;
      const offset = toolSize%2 == 0 ? 0 : 0.5;
      const displayPenSize = toolSize * this.scale;
      
      position.x = (position.x + offset)*this.scale;
      position.y = (position.y + offset)*this.scale;

      // カーソル包含矩形
      let cl: number;
      let ct: number;
      let cw: number;
      let ch: number;

      ctx.save();
      // カーソルをクリップ領域として描く
      // 円形
      if (displayPenSize >= 8) {
        ctx.beginPath();
        ctx.arc(
          position.x + offset,
          position.y + offset,
          displayPenSize/2+1.1, 0, 2*Math.PI
        );
        ctx.arc(
          position.x + offset,
          position.y + offset,
          displayPenSize/2+0.4, 0, 2*Math.PI
        );
        ctx.clip("evenodd");

        cl = position.x - displayPenSize/2 - 2;
        ct = position.y - displayPenSize/2 - 2;
        cw = ch = displayPenSize + 4;
      }
      // 十字
      else {
        ctx.beginPath();
        ctx.rect(position.x,   position.y,   1, 1);
        ctx.rect(position.x-9, position.y,   5, 1);
        ctx.rect(position.x+5, position.y,   5, 1);
        ctx.rect(position.x,   position.y-9, 1, 5);
        ctx.rect(position.x,   position.y+5, 1, 5);
        ctx.clip();

        cl = position.x - 9;
        ct = position.y - 9;
        cw = ch = 19;
      }
      // クリップ領域に描画済みの画像を反転フィルタをかけて再描画
      ctx.filter = "url(#tegaki-canvas-cursor-filter)";
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.canvas, cl, ct, cw, ch, cl, ct, cw, ch);
      ctx.restore();
      
      this._cursorRect.set4f(cl, ct, cw, ch).expand(1);
    }

    // Set cursor css;
    if (this._cursorName != cursorName) {
      this._cursorName = cursorName;
      const cursorInfo = toolCursors[cursorName];
      if (typeof cursorInfo == "undefined") {
        this.cursorOverlay.style.cursor = "none";
      }
      else {
        this.cursorOverlay.style.cursor = `${cursorInfo.cursor}`;
      }
    }
  }

  private _needsRender: boolean = false;
  /**
   * 再描画の要求フラグを立てる
   */
  requestRender() {
    if (this._needsRender) {
      return;
    }
    this._needsRender = true;
    requestAnimationFrame(this._renderCallback);
  }

  /**
   * キャンバス描画処理
   */
  render() {
    const offCtx = this._offscreen.context;
    const ctx = this.context;
    
    if (
      this._offscreen.width != this.innerWidth ||
      this._offscreen.height != this.innerHeight
    ) {
      this._offscreen.width = this.innerWidth;
      this._offscreen.height = this.innerHeight;
    }

    this._offscreen.fill(this.backgroundColor);

    // Render Layers
    offCtx.save();
    offCtx.imageSmoothingEnabled = false;
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i]

      if (! layer.isVisible) {
        continue;
      }
      const opacity = layer.opacity;
      offCtx.globalAlpha = opacity;

      if (i == this._currentLayerPosition && this.isDrawing && this._currentTool.hasPreview) {
        // ストローク中のプレビュー表示
        this._currentLayerOffscreen.set(layer);
        this._currentTool.renderPreview(this, layer, this._currentLayerOffscreen);
        offCtx.drawImage(this._currentLayerOffscreen.canvas, 0, 0);
      }
      else {
        offCtx.drawImage(layer.canvas, 0, 0);
      }
    }
    offCtx.restore();

    // Render offscreen to canvas
    ctx.save();
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.scale(this._scale/this._innerScale, this._scale/this._innerScale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this._offscreen.canvas, 0, 0);
    ctx.restore();

    if (this.isDrawing && this._currentTool.hasOverlay) {
      this._currentTool.renderOverlay(this, ctx);
    }
    // Render Selected Region
    if (this._selectedRegion != null && (! this._selectedRegion.isEmpty)) {
      this._selectedRegion.drawTo(this, this.context);
    }


    this._needsRender = false;
  }

  /**
   * イベントリスナ登録を中心とした初期化処理
   */
  init() {
    // 操作不能不具合修正
    // pointerId が無効になる場合があるので、例外キャッチを追加.
    // pointerup, pointercalcel 時にもキャプチャをリリースするように.

    this.cursorOverlay.addEventListener("pointerdown", (ev: PointerEvent) => {
      if (ev.pointerType == "mouse" && ev.button != 0) {
        return;
      }

      if (this._activePointerId != null) {
        try {
          this.cursorOverlay.releasePointerCapture(this._activePointerId);
        } catch{}
        onPointerUp();
      }

      this._mouseX = ev.clientX;
      this._mouseY = ev.clientY;
      const position = this.positionInCanvas(this._mouseX, this._mouseY);

      this._activePointerId = ev.pointerId;
      this.cursorOverlay.setPointerCapture(this._activePointerId);

      if (this._currentTool.hasStroke) {
        this._strokeManager.start(position.x, position.y);
      }
      this._currentTool.onDown(this, position.x, position.y);
      
      if (this._currentTool.hasPreview) {
        this.requestRender();
      }
    });
    
    this.cursorOverlay.addEventListener("pointermove", (ev: PointerEvent) => {
      if (this._activePointerId == null) {
        this._mouseX = ev.clientX;
        this._mouseY = ev.clientY;
        this._isMouseEnter = true;
        this.requestRenderCursor();
        return false;
      }

      if (this._activePointerId != ev.pointerId) {
        return;
      }
      
      this._isMouseEnter = true;
      this._mouseX = ev.clientX;
      this._mouseY = ev.clientY;
      const position = this.positionInCanvas(this._mouseX, this._mouseY);
      if (this._currentTool.hasStroke) {
        this._strokeManager.move(position.x, position.y);
      }
      
      this._currentTool.onDrag(this, position.x, position.y);
      if (this._currentTool.hasPreview || this._currentTool.hasOverlay) {
        this.requestRender();
      }
      this.requestRenderCursor();
    });

    this.cursorOverlay.addEventListener("pointerleave", (ev: PointerEvent) => {
      if (this._activePointerId == null) {
        this._isMouseEnter = false;
        this.requestRenderCursor();
      }
    });
    
    const onPointerUp = () => {
      const position = this.positionInCanvas(this._mouseX, this._mouseY);
      if (this._currentTool.hasStroke) {
        this._strokeManager.finish();
      }

      this._currentTool.onUp(this, position.x, position.y);
      if (this._currentTool.hasPreview || this._currentTool.hasOverlay) {
        this.requestRender();
      }
      if (this._nextTool != null) {
        this.currentTool = this._nextTool;
        this._nextTool = null;
      }
    };

    this.cursorOverlay.addEventListener("pointerup", (ev: PointerEvent) => {
      if (this._activePointerId != ev.pointerId) {
        return;
      }

      try {
        this.cursorOverlay.releasePointerCapture(this._activePointerId);
      } catch{}
      this._activePointerId = null;

      this._mouseX = ev.clientX;
      this._mouseY = ev.clientY;

      onPointerUp();
    });

    this.cursorOverlay.addEventListener("pointercancel", (ev: Event) => {
      if (this._activePointerId == null) {
        return;
      }
      
      try {
        this.cursorOverlay.releasePointerCapture(this._activePointerId);
      } catch{}
      this._activePointerId = null;

      if (this._currentTool.hasStroke) {
        this._strokeManager.finish();
      }
      this._currentTool.onCancel(this);
      if (this._currentTool.hasPreview || this._currentTool.hasOverlay) {
        this.requestRender();
      }
      if (this._nextTool != null) {
        this.currentTool = this._nextTool;
        this._nextTool = null;
      }
    });
    
    this._strokeManager.addObserver(this, "update", () => {
      this.requestRender();
    });

    this.reset(this.width, this.height, this.backgroundColor, true);
    this.requestRender();
  }

  /**
   * 指定座標の色を取得し通知する
   * @param x 
   * @param y 
   */
  execSpoit(x?: number, y?: number) {
    if (typeof x == "undefined" || typeof y == "undefined") {
      const position = this.positionInCanvas(this._mouseX, this._mouseY);
      x = position.x;
      y = position.y;
    }
    const color = this.getColorAt(x, y);
    if (typeof color !== "undefined") {
      this.notify("spoit", {
        x: x, y: y,
        color: color,
      });
    }
  }

  /**
   * 指定座標の色の取得
   */
  getColorAt(x: number, y:number): Color | undefined {
    x = x | 0;
    y = y | 0;
    if (x < 0 || x >= this.innerWidth || y < 0 || y >= this.innerHeight) {
      return void(0);
    }
    
    try {
      this._spoitContext.drawImage(this._offscreen.canvas, x, y, 1, 1, 0, 0, 1, 1);
      const imageData = this._spoitContext.getImageData(0, 0, 1, 1);
      const data = imageData.data;
      const color = new Color(data[0], data[1], data[2]);
      return color;
    }
    catch {}
    return void(0);
  }

  selectLayer(layer: Layer) {
    const position = this.layers.indexOf(layer);
    if (position == -1) {
      throw new Error(`Specified layer is not found`);
    }
    this.selectLayerAt(position);
  }

  selectLayerAt(position: number) {
    if (position >= this.layers.length) {
      throw new RangeError(`position must be less than layers.length`);
    }
    this._currentLayerPosition = position;
    this.notify("change-current-layer", {
      position: position,
      layer: this.currentLayer
    });
  }


  clipBegin(context: CanvasRenderingContext2D) {
    this._selectedRegion?.clipBegin(context);
  }
  clipEnd(context: CanvasRenderingContext2D) {
    this._selectedRegion?.clipEnd(context);
  }

  // ============================================================
  // キャンバス操作
  // ============================================================

  /**
   * 新規キャンバス
   */
  reset(
    width: number, height: number,
    backgroundColor: Color.Immutable = Color.white,
    resetHistory: boolean = false
  ) {
    const layer = new Layer(width * this.innerScale, height * this.innerScale);

    const newDoc = new TegakiCanvasDocument(
      width, height, [layer], backgroundColor
    );
    const action = new CanvasAction.ChangeDocument(this, newDoc);
    if (resetHistory) {
      const undo = new CanvasAction.None(this);
      this.pushAction(new HistoryNode(action, undo));
      this._undoStack.clear();
      this.notify("update-history", this);
    }
    else {
      const oldDoc = this.document;
      const undo = new CanvasAction.ChangeDocument(this, oldDoc);
      this.pushAction(new HistoryNode(action, undo));
    }
  }

  changeBackgroundColor(color: Color.Immutable) {
    const currentBgColor = this.backgroundColor;
    if (color.equals(this.backgroundColor)) {
      return;
    }

    const action = new CanvasAction.ChangeBackgroundColor(this, color);
    const undo = new CanvasAction.ChangeBackgroundColor(this, currentBgColor);
    this.pushAction(new HistoryNode(action, undo));
  }

  // --------------------------------------------------
  // Layer
  // --------------------------------------------------
  /**
   * Add a new layer to $position
   * @param position 
   */
  newLayer(position: number) {
    if (position > this.layers.length || position < 0) {
      throw new RangeError(`position is out of range`);
    }
    const layer = new Layer(this.innerWidth, this.innerHeight);

    const undo = new CanvasAction.DeleteLayer(this, position);
    const action = new CanvasAction.AddLayer(this, position, layer);
    this.pushAction(new HistoryNode(action, undo));
  }

  /**
   * Delete layer
   * @param layer 
   */
  deleteLayer(layer: Layer) {
    const position = this.layers.indexOf(layer);
    if (position == -1) {
      throw new Error("Specified layer is not found");
    }
    this.deleteLayerAt(position);
  }

  /**
   * Delete layer at $position
   * @param position 
   */
  deleteLayerAt(position: number) {
    if (position >= this.layers.length || position < 0) {
      throw new RangeError(`position is out of range`);
    }
    if (this.layers.length == 1) {
      return;
    }
    const layer = this.layers[position];

    const undo = new CanvasAction.AddLayer(this, position, layer);
    const action = new CanvasAction.DeleteLayer(this, position);
    this.pushAction(new HistoryNode(action, undo));
  }

  moveLayer(layer: Layer, newPosition: number) {
    const position = this.layers.indexOf(layer);
    if (position == -1) {
      throw new Error("Specified layer is not found");
    }
    this.moveLayerAt(position, newPosition);
  }

  moveLayerAt(position: number, newPosition: number) {
    if (position >= this.layers.length || position < 0) {
      throw new RangeError(`position is out of range`);
    }
    if (newPosition >= this.layers.length || newPosition < 0) {
      return;
    }
    const undo = new CanvasAction.MoveLayer(this, newPosition, position);
    const action = new CanvasAction.MoveLayer(this, position, newPosition);
    this.pushAction(new HistoryNode(action, undo));
  }

  moveLayerRelatively(layer: Layer, n: number) {
    const position = this.layers.indexOf(layer);
    if (position == -1) {
      throw new Error("Specified layer is not found");
    }
    this.moveLayerAt(position, position + n);
  }

  changeLayerOpacity(layer: Layer, opacity: number) {
    opacity = clamp(opacity, 0, 1);
    if (layer.opacity == opacity) {
      return;
    }

    const undo = new CanvasAction.ChangeLayerOpacity(this, layer, layer.opacity);
    const action = new CanvasAction.ChangeLayerOpacity(this, layer, opacity);
    this.pushAction(new HistoryNode(action, undo));
  }

  // --------------------------------------------------
  // Draw
  // --------------------------------------------------
  /**
   * 描画色での塗りつぶし
   */
  fill(color: Color.Immutable) {
    const layer = this.currentLayer;
    const undo = new CanvasAction.DrawImage(
      this, layer,
      layer, 0, 0, layer.width, layer.height,
      0, 0
    );

    const action = new CanvasAction.Fill(this, layer, color)
    this.pushAction(new HistoryNode(action, undo));
  }

  /**
   * 背景色での塗りつぶし
   * @param pushAction 操作前にアンドゥ履歴に追加するか
   */
  fillWithBackgroundColor() {
    this.fill(this.backgroundColor);
  }

  /**
   * バケツ塗り
   */
  bucketFill(layer: Layer, x: number, y: number, fillColor: Color.Immutable, option?: BucketOption) {
    if (typeof x == "undefined" || typeof y == "undefined") {
      const position = this.positionInCanvas(this._mouseX, this._mouseY);
      x = position.x;
      y = position.y;
    }

    const fillImage = offscreenPool.get().setSize(this.innerWidth, this.innerHeight);
    const rect = this.createBucketFillImageInto(fillImage, x, y, fillColor, option);
    if (typeof rect === "undefined" || rect.isEmpty()) {
      offscreenPool.return(fillImage);
      return;
    }
    rect.intersection4f(0, 0, layer.width, layer.height);
    
    const undo = new CanvasAction.DrawImage(
      this, layer, layer,
      rect.x, rect.y, rect.width, rect.height,
      rect.x, rect.y
    );
    const action = new CanvasAction.DrawImage(
      this, layer, fillImage, 
      rect.x, rect.y, rect.width, rect.height,
      rect.x, rect.y, false
    );
    this.pushAction(new HistoryNode(action, undo));

    offscreenPool.return(fillImage);
  }

  /**
   * 画像の消去
   */
  clear() {
    const layer = this.currentLayer;
    const undo = new CanvasAction.DrawImage(
      this, layer,
      layer, 0, 0, layer.width, layer.height,
      0, 0
    );
    const action = new CanvasAction.Clear(this, layer);
    this.pushAction(new HistoryNode(action, undo));
  }

  drawPath(path: BrushPath, brush: BrushState) {
    const layer = this.currentLayer;
    const pathRect = Rect.intersection(
      getPathBoundingRect(path, brush.size, 1),
      new Rect(0, 0, this.innerWidth, this.innerHeight)
    );

    let undo: CanvasAction;
    if (pathRect.isEmpty()) {
      undo = new CanvasAction.None(this);
    }
    else {
      undo = new CanvasAction.DrawImage(
        this, layer, layer,
        pathRect.x, pathRect.y, pathRect.width, pathRect.height,
        pathRect.x, pathRect.y
      );
    }
    const action = new CanvasAction.DrawPath(
      this, layer, brush, this._strokeManager.path
    );
    
    this.pushAction(new HistoryNode(action, undo));
  }

  /**
   * 画像の左右反転
   */
  flip() {
    const undo = new CanvasAction.Flip(this);
    const action = new CanvasAction.Flip(this);
    this.pushAction(new HistoryNode(action, undo));
  }

  /**
   * キャンバスのリサイズ
   * @param width 
   * @param height 
   */
  resize(width: number, height: number) {
    width = width | 0;
    height = height | 0;
    if (width < 1) {
      throw new RangeError("width must be greater than 0");
    }
    if (height < 1) {
      throw new RangeError("height must be greater than 0");
    }

    let undo: CanvasAction;
    if (width > this.width && height > this.height) {
      undo = new CanvasAction.Resize(this, this.width, this.height);
    }
    else {
      undo = new CanvasAction.UndoResize(this);
    }
    const action = new CanvasAction.Resize(this, width, height);
    this.pushAction(new HistoryNode(action, undo));
  }

  /**
   * 新規範囲。nullを渡すと選択範囲解除
   * @param region 
   * @returns 
   */
  selectNew(region: CanvasRegion | null) {
    if (this.selectedRegion == region) {
      return;
    }
    const undo = new CanvasAction.SelectNew(this, this.selectedRegion);
    const action = new CanvasAction.SelectNew(this, region);
    this.pushAction(new HistoryNode(action, undo));
  }

  /**
   * 全体を選択
   */
  selectAll() {
    const region = new CanvasRegion();
    region.setRect(new Rect(0, 0, this.width, this.height));
    this.selectNew(region);
  }

  /**
   * 選択範囲の移動。
   */
  selectMove(x: number, y: number) {
    if (this.selectedRegion == null) {
      return;
    }

    if(this._grabState !== null) {
      this.selectGrabMove(x, y);
      return;
    }

    const undo   = new CanvasAction.SelectMove(this, -x, -y);
    const action = new CanvasAction.SelectMove(this,  x,  y);
    this.pushAction(new HistoryNode(action, undo));
  }

  // --------------------------------------------------

  /**
   * 選択範囲中の画像を抜き出す
   */
  putSelectedImageInto(dst: Offscreen, layer: Layer): Rect.Immutable | undefined {
    const region = this.selectedRegion;
    if (region == null || region.isEmpty) {
      return;
    }

    const rect = region.boudingRect();
    dst.setSize(rect.width, rect.height);
    dst.context.drawImage(
      layer.canvas,
      rect.x, rect.y, rect.width, rect.height,
      0, 0, rect.width, rect.height
    );
    
    return rect;
  }

  /**
   * 塗り結果の画像作成
   */
  createBucketFillImageInto(
    dst: Offscreen, x: number, y: number,
    fillColor: Color.Immutable, option?: BucketOption
  ): Rect | undefined {
    if (typeof dst.context.filter === "undefined") {
      return this.createBucketFillImageInto_WebGL(dst, x, y, fillColor, option);
    }

    x = x | 0;
    y = y | 0;
    const fillConnected = true;
    const tolerance = option?.tolerance || 0;
    const closeGap = fillConnected ? (option?.closeGap || 0) : 0;
    const expand = (option?.expand || 0) + (closeGap / 2);
    const boundingRect = new Rect(0, 0, 0, 0);

    const color = this.getColorAt(x, y);
    if (typeof color === "undefined") {
      return;
    }
    const baseImage = offscreenPool.get().setSize(this._offscreen.width, this._offscreen.height);
    this.clipBegin(baseImage.context);
    baseImage.context.drawImage(this._offscreen.canvas, 0, 0);
    this.clipEnd(baseImage.context);
    
    const fillMask = offscreenPool.get().setSize(this._offscreen.width, this._offscreen.height);
    // SVG フィルタを使って指定色が不透明の黒、それ以外が透明な画像を抽出
    {
      const filter = new SvgFilter();
      // ベースを領域色で塗りつぶし
      filter.add("feFlood", {"flood-color": color});
      // 差の絶対値で合成
      filter.add("feBlend", {
        "mode": "difference",
        "in2": "SourceGraphic",
        "result": "diff"
      });
      // 各ピクセルを差の二乗に
      filter.add("feBlend", {
        "mode": "multiply",
        "in": "diff", "in2": "diff",
      });
      // 領域色を透明、それ以外を不透明に
      const l = 255*255;
      const t = 3 + 3*l*tolerance/CanvasTool.Bucket.toleranceMax;
      filter.add("feColorMatrix", {
        "type": "matrix",
        "values": [
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0,
          l, l, l, 0, -t,
        ],
      });
      // 隙間閉じの分だけ非領域色を拡大
      if (closeGap > 0) {
       filter.add("feMorphology", {
        "operator": "dilate",
        "radius": closeGap/2,
       });
      }
      // 透明/不透明 反転
      filter.add("feColorMatrix", {
        "type": "matrix",
        "values": [
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0,
          0, 0, 0, -1, 1,
        ],
      });
      drawImageWithSVGFilter(
        fillMask.context,
        baseImage.canvas,
        filter.code
      );
    }

    // 隣接領域に限定
    if (fillConnected) {
      const imageData = getImageData(fillMask.canvas, 0, 0, fillMask.canvas.width, fillMask.canvas.height);
      const src = imageData.data;

      const regionToFill = getConnectedPixels(
        fillMask.width, fillMask.height,
        src, x, y
      );
      const dstImageData = new ImageData(
        regionToFill.region,
        fillMask.width, fillMask.height
      );
      fillMask.context.putImageData(dstImageData, 0, 0);
      boundingRect.set(regionToFill.rect).expand(Math.ceil(expand));
    }
    else {
      boundingRect.set4f(0, 0, fillMask.width, fillMask.height);
    }

    // マスクから塗りつぶし画像の作成
    {
      const filter = new SvgFilter();
      // ベースを領域色で塗りつぶし
      filter.add("feFlood", {"flood-color": fillColor});
      filter.add("feComposite", {
        "in2": "SourceGraphic",
        "operator": "in",
      });
      if (expand > 0) {
        filter.add("feMorphology", {
          "operator": "dilate",
          "radius": expand,
        });
      }
      drawImageWithSVGFilter(
        dst.context,
        fillMask.canvas,
        filter.code
      );
    }
    offscreenPool.return(fillMask);
    offscreenPool.return(baseImage);
    return boundingRect;
  }


  private createBucketFillImageInto_WebGL(
    dst: Offscreen, x: number, y: number,
    fillColor: Color.Immutable, option?: BucketOption
  ): Rect | undefined {
    x = x | 0;
    y = y | 0;
    const fillConnected = true;
    const tolerance = option?.tolerance || 0;
    const closeGap = fillConnected ? (option?.closeGap || 0) : 0;
    const expand = (option?.expand || 0) + (closeGap / 2);
    const boundingRect = new Rect(0, 0, 0, 0);

    const color = this.getColorAt(x, y);
    if (typeof color === "undefined") {
      return;
    }

    // 選択範囲領域の画像抽出
    const baseImage = offscreenPool.get().setSize(this._offscreen.width, this._offscreen.height);
    this.clipBegin(baseImage.context);
    baseImage.context.drawImage(this._offscreen.canvas, 0, 0);
    this.clipEnd(baseImage.context);
    
    // 領域色のマスクを取得
    const fillMask = offscreenPool.get().setSize(this._offscreen.width, this._offscreen.height);
    WebGLFilter.drawImageWithFilters(
      fillMask.context, baseImage.canvas, [
        {filter: "color-mask", uniforms: {
          "maskColor": [color.r, color.g, color.b],
          "tolerance": tolerance/CanvasTool.Bucket.toleranceMax,
        }},
        ...this.genExpandFilters(closeGap/2),
        {filter: "invert"},
      ]
    );

    // 隣接領域に限定
    if (fillConnected) {
      const imageData = getImageData(fillMask.canvas, 0, 0, fillMask.canvas.width, fillMask.canvas.height);
      const src = imageData.data;

      const regionToFill = getConnectedPixels(
        fillMask.width, fillMask.height,
        src, x, y
      );
      const dstImageData = new ImageData(
        regionToFill.region,
        fillMask.width, fillMask.height
      );
      fillMask.context.putImageData(dstImageData, 0, 0);
      boundingRect.set(regionToFill.rect).expand(Math.ceil(expand));
    }
    else {
      boundingRect.set4f(0, 0, fillMask.width, fillMask.height);
    }

    // ベースを領域色で塗りつぶし
    {
      WebGLFilter.drawImageWithFilters(
        dst.context,
        fillMask.canvas,
        [
          ...this.genExpandFilters(expand),
          {filter: "paint", uniforms:{
            "paintColor": [fillColor.r, fillColor.g, fillColor.b],
          }},
        ]
      );
    }
    offscreenPool.return(fillMask);
    offscreenPool.return(baseImage);

    return boundingRect;
  }

  private genExpandFilters(expand: number) {
    const result: {
      filter: "expand"; uniforms: {"size": number};
    }[] = [];
    while (expand > 0) {
      const v = Math.min(expand, 5);
      result.push({filter: "expand", uniforms:{
        "size": v,
      }},)
      expand -= v;
    }
    return result;
  }

  /**
   * 取り消し
   */
  undo() {
    if (this._grabState !== null) {
      this.selectGrabFinish();
    }
    if (this._undoStack.length == 0) {
      return;
    }
    const node = this._undoStack.pop();
    node.undo.exec();
    this._redoStack.push(node);
    this.requestRender();
    this.notify("update-history", this);
  }

  /**
   * やり直し 
   */
  redo() {
    if (this._redoStack.length == 0) {
      return;
    }
    const node = this._redoStack.pop();
    node.action.exec();
    this._undoStack.push(node);
    this.requestRender();
    this.notify("update-history", this);
  }

  /**
   * 現在のwidth, height, scaleプロパティから、canvas 要素のサイズを反映する。
   */
  updateCanvasSize() {
    this.canvas.width = this.width*this._scale;
    this.canvas.height = this.height*this._scale;
    this.cursorOverlay.width = this.width*this._scale;
    this.cursorOverlay.height = this.height*this._scale;
    this.requestRender();
    this.notify("change-size", this);
  }

  /**
   * キャンバス操作の実行
   */
  pushAction(node: HistoryNode) {
    // 掴み状態だったら確定させる
    if (this._grabState) {
      this.selectGrabFinish();
    }

    node.action.exec();

    // 短期間の操作の場合、直近の履歴とマージ
    if (this._redoStack.length == 0) {
      const lastNode = this._undoStack.peek();
      if (typeof lastNode !== "undefined") {
        const mergedNode = node.mergeWith(lastNode, this.strokeMergeTime);
        if (typeof mergedNode !== "undefined") {
          this._undoStack.pop();
          node = mergedNode;
        }
      }
    }

    this._undoStack.push(node);

    // delete the oldest history
    while (this._undoStack.length > this.undoMax) {
      let oldestNode = this._undoStack.shift();
      oldestNode.dispose();
    }

    // clean redo stack
    while (this._redoStack.length > 0) {
      let redoNode = this._redoStack.pop();
      redoNode.dispose();
    }

    this.notify("update-history", this);
    this.requestRender();
  }
  

  private _grabState: CanvasAction.GrabState | null = null;
  get grabState() {
    return this._grabState;
  }
  set grabState(grabState: CanvasAction.GrabState | null) {
    this._grabState = grabState;
  }
  /**
   * 選択領域の掴み開始
   */
  selectGrab() {
    if (this.selectedRegion == null) {
      return;
    }
    const layer = this.currentLayer;
    if (this._grabState !== null) {
      if (this._grabState.layer == layer) {
        return;
      }
      this.selectGrabFinish();
    }
    this.selectedRegion.normalize();

    const grabState = new CanvasAction.GrabState(this, layer);
    const action = new CanvasAction.SelectGrabStart(this, grabState);
    const undo = new CanvasAction.SelectGrabCancel(this, grabState);
    this.pushAction(new HistoryNode(action, undo));
  }
  /**
   * 掴んだ選択領域の開始地点からの移動
   */
  selectGrabMove(x: number, y: number) {
    if (this.selectedRegion == null) {
      return;
    }
    if (this._grabState == null) {
      this.selectGrab();
      if (this._grabState == null) {
        throw new Error("Failed to grab");
      }
    }

    this._grabState.offsetX += x;
    this._grabState.offsetY += y;
    this.selectedRegion.offsetX = this._grabState.offsetX;
    this.selectedRegion.offsetY = this._grabState.offsetY;

    const layer = this._grabState.layer;
    const ctx = layer.context;
    const rect = this.selectedRegion.boudingRect();
    layer.clear();
    ctx.drawImage(this._grabState.backupImage.canvas, 0, 0);
    ctx.clearRect(this._grabState.startX, this._grabState.startY, rect.width, rect.height);
    ctx.drawImage(this._grabState.image.canvas, rect.x, rect.y, rect.width, rect.height);
    layer.notify("update", layer);
    this.requestRender();
  }
  /**
   * 掴み操作の完了
   */
  selectGrabFinish() {
    if (this._selectedRegion == null || this._grabState == null) {
      return;
    }
    // 最後の変更履歴を取得し、選択範囲移動アクションに変換
    const node = this._undoStack.peek();
    if (!(typeof node !== "undefined" &&
        node.action instanceof CanvasAction.SelectGrabStart &&
        node.undo   instanceof CanvasAction.SelectGrabCancel)
    ) {
      console.warn("Latest action is not SelectGrabStart");
      return;
    }
    const grabState = this._grabState;
    const region = this._selectedRegion;
    const rect = region.boudingRect();
    const dstRect = rect.copy().intersection4f(0, 0, grabState.layer.width, grabState.layer.height);
    
    const action = new CanvasAction.SelectMoveImage(
      this, grabState.layer, grabState.offsetX, grabState.offsetY);
    const undo = new CanvasAction.Merge(
      // 移動先範囲の復元
      new CanvasAction.DrawImage(
        this, grabState.layer,
        grabState.backupImage, dstRect.x, dstRect.y, dstRect.width, dstRect.height,
        dstRect.x, dstRect.y
      ),
      // 移動元範囲の復元
      new CanvasAction.DrawImage(
        this, grabState.layer,
        grabState.image, 0, 0, rect.width, rect.height,
        grabState.startX, grabState.startY
      ),
      // 選択範囲の移動
      new CanvasAction.SelectMove(this, -grabState.offsetX, -grabState.offsetY),
    );
    node.action.dispose();
    node.undo.dispose();
    node.action = action;
    node.undo = undo;

    this._grabState = null;
  }

  /**
   * クライアント座標をCanvas内のローカル座標に変換する。
   * @param x 
   * @param y 
   * @returns 
   */
  positionInCanvas(x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect();
    x = ((x - rect.x)*this.innerWidth/rect.width);
    y = ((y - rect.y)*this.innerHeight/rect.height);

    return {x, y};
  }
}

export interface TegakiCanvas {
  addObserver(observer: Object, name: "update-history",
    callback: () => void
  ): void;
  addObserver(observer: Object, name: "change-document",
    callback: (doc: TegakiCanvasDocument) => void
  ): void;
  addObserver(observer: Object, name: "change-size",
    callback: () => void
  ): void;
  addObserver(observer: Object, name: "change-background-color",
    callback: (color: Color.Immutable) => void
  ): void;
  addObserver(observer: Object, name: "change-tool",
    callback: (tool: CanvasTool) => void
  ): void;
  addObserver(observer: Object, name: "update-history",
    callback: () => void
  ): void;
  addObserver(observer: Object, name: "add-layer",
    callback: (ev: {layer: Layer; position: number;}) => void
  ): void;
  addObserver(observer: Object, name: "delete-layer",
    callback: (ev: {layer: Layer; position: number;}) => void
  ): void;
  addObserver(observer: Object, name: "move-layer",
    callback: (ev: {layer: Layer; from: number; to: number;}) => void
  ): void;
  addObserver(observer: Object, name: "change-current-layer",
    callback: (ev: {layer: Layer; position: number;}) => void
  ): void;
  addObserver(observer: Object, name: "spoit",
    callback: (ev: {color: Color.Immutable}) => void
  ): void;
}

function drawImageWithSVGFilter(
  context: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  code: string
) {
  const filterElem = document.getElementById("tegaki-canvas-svg-filter") as HTMLElement;
  filterElem.innerHTML = code;
  context.save();
  context.filter = "url(#tegaki-canvas-svg-filter)";
  context.drawImage(image, 0, 0);
  context.restore();
}

let _imageDataCanvas: OffscreenCanvas | undefined;
function getImageData(
  canvas: HTMLCanvasElement,
  x: number = 0, y: number = 0,
  width: number = canvas.width, height: number = canvas.height
) {
  if (typeof _imageDataCanvas === "undefined") {
    _imageDataCanvas = createOffscreenCanvas(width, height) as OffscreenCanvas;
  }
  else {
    _imageDataCanvas.width = width;
    _imageDataCanvas.height = height;
  }
  const ctx = _imageDataCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (ctx == null) {
    throw new Error("Failed to get RenderingContext2D");
  }

  ctx.drawImage(canvas, x, y, width, height, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

export default TegakiCanvas;
