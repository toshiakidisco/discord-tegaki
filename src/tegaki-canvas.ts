import Stack from "./stack";
import Color from "./color";
import Subject from "./subject";

import svgFilterCode from "raw-loader!./svg-filter.svg";
import fillMaskFilterCode from "raw-loader!./fill-mask-filter.svg";
import fillImageFilterCode from "raw-loader!./fill-image-filter.svg";

import { parseSvg } from "./dom";
import { getAssetUrl } from "./asset";
import Offscreen from "./canvas-offscreen";
import CanvasAction, { drawPath, getPathBoundingRect } from "./canvas-action";
import { Rect } from "./rect";
import StrokeManager from "./stroke-manager";
import { Layer } from "./canvas-layer";
import TegakiCanvasDocument from "./canvas-document";
import { ObservableColor } from "./observable-value";
import CanvasTool from "./canvas-tool";
import { clamp, getConnectedPixels } from "./funcs";
import ObjectPool from "./object-pool";

export type PenMode = "pen" | "eraser";
export type SubTool = "none" | "spoit" | "bucket";

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

const toolCursors: {[tool: string]: {x: number; y: number;}} = {
  "spoit": {x: 1, y: 14},
  "bucket": {x: 2, y: 12},
  "prohibit": {x: 7, y: 7},
}

const HISTORY_MAX = 20;
class HistoryNode {
  action: CanvasAction;
  undo: CanvasAction;
  time: number = Date.now();

  constructor(action: CanvasAction, undo: CanvasAction) {
    this.action = action;
    this.undo = undo;
  }

  dispose() {
    this.action.dispose();
    this.undo.dispose();
  }

  mergeWith(node: HistoryNode): HistoryNode | undefined {
    const a0 = node.action;
    const a1 = this.action;
    const u0 = node.undo;
    const u1 = this.undo;
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
  }
};

export class TegakiCanvas extends Subject {
  readonly element: HTMLDivElement;
  readonly cursorOverlay: HTMLCanvasElement;
  readonly cursorContext: CanvasRenderingContext2D;
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;

  // 選択中のツール
  private _currentTool: CanvasTool = CanvasTool.none;
  // 描画中のツール
  private _drawingTool: CanvasTool.Blush = new CanvasTool.Blush("pen", 1);

  private _width: number;
  private _height: number;
  private _innerScale: number;
  readonly backgroundColor: ObservableColor = new ObservableColor(240, 224, 214);

  private _layers: Layer[];
  private _offscreen: Offscreen;
  private _currentLayerOffscreen: Offscreen;
  private _scale: number = 1;

  private _mouseX: number = 0;
  private _mouseY: number = 0;
  private _isMouseEnter: boolean = false;

  private _isDrawing: boolean = false;
  private _activePointerId: number | null = null;

  private _renderCallback: FrameRequestCallback;
  private _renderCursorCallback: FrameRequestCallback;

  private _undoStack: Stack<HistoryNode> = new Stack();
  private _redoStack: Stack<HistoryNode> = new Stack();

  private _strokeManager: StrokeManager = new StrokeManager();
  private _spoitContext: OffscreenCanvasRenderingContext2D;

  private _currentLayerPosition: number = 0;

  readonly observable: {
    foreColor: ObservableColor;
  };

  constructor(init: CanvasInit) {
    super();
    this.observable = {
      foreColor: (new ObservableColor(255, 255, 255)).set(init.foreColor),
    };

    this._width = init.width;
    this._height = init.height;
    this._innerScale = 1;
    this.backgroundColor.set(init.backgroundColor);

    // Create canvas for image
    this.element = document.createElement("div");
    this.element.className = "tegaki-canvas";

    this.canvas = document.createElement("canvas");
    this.canvas.className = "layer";
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
    this.cursorOverlay.className = "cursor";
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

    this._layers = [];
    this._offscreen = new Offscreen(this.innerWidth, this.innerHeight);
    this._currentLayerOffscreen = new Offscreen(this.innerWidth, this.innerHeight);

    // Create 2D context for spoit
    const spoitCanvas = new OffscreenCanvas(1, 1);
    const spoitContext = spoitCanvas.getContext("2d", {willReadFrequently: true});
    if (spoitContext === null) {
      throw new Error("Failed to get CanvasRendering2DContext");
    }
    this._spoitContext = spoitContext;

    this.init();
  }

  get foreColor(): Color.Immutable {
    return this.observable.foreColor.value;
  }
  set foreColor(color: Color.Immutable) {
    this.observable.foreColor.set(color);
  }

  get currentLayer(): Layer {
    return this._layers[this._currentLayerPosition];
  }

  get currentLayerPosition(): number {
    return this._currentLayerPosition;
  }

  get layers(): Layer[] {
    return this._layers;
  }

  get currentTool() {
    return this._currentTool;
  }
  set currentTool(tool: CanvasTool) {
    this._currentTool = tool;
    this.requestRenderCursor();
  }

  get drawingTool() {
    return this._drawingTool;
  }

  get width() {
    return this._width;
  }

  get height() {
    return this._height;
  }

  setSize(width: number, height: number) {
    if (this._width == width && this._height == height) {
      return;
    }
    this._width = width;
    this._height = height;
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

  /**
   * 選択中ツールのサイズ
   */
  get toolSize() {
    return this._drawingTool.size;
  }

  /**
   * 選択中ツールの色
   */
  get toolColor(): Color.Immutable {
    return this.foreColor;
  }

  get toolComposite(): GlobalCompositeOperation {
    return this._drawingTool.composite;
  }

  /**
   * 描画中の状態か
   */
  get isDrawing() {
    return this._isDrawing;
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
    
    let cursorName: string;
    const isBlushTool = this.currentTool instanceof CanvasTool.Blush;
    // Render cursor
    if ((!this.currentLayer.isVisible) && isBlushTool) {
      cursorName = "prohibit";
    }
    else if (this._isDrawing || isBlushTool) {
      cursorName = "none";
      const tool = this._isDrawing ? this._drawingTool : this.currentTool;

      const toolSize = tool.size;
      const offset = toolSize%2 == 0 ? 0 : 0.5;
      const displayPenSize = toolSize * this.scale;
      const position = this.positionInCanvas(this._mouseX, this._mouseY);
      
      position.x = (position.x + offset)*this.scale | 0;
      position.y = (position.y + offset)*this.scale | 0;

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
      
      this._cursorRect.set4f(cl, ct, cw, ch);
    }
    else {
      cursorName = this._currentTool.name;
    }

    // Set cursor css;
    if (this._cursorName != cursorName) {
      this._cursorName = cursorName;
      const cursorInfo = toolCursors[cursorName];
      if (typeof cursorInfo == "undefined") {
        this.cursorOverlay.style.cursor = "none";
      }
      else {
        this.cursorOverlay.style.cursor = `url(${getAssetUrl("asset/cursor-"+cursorName+".png")}) ${cursorInfo.x} ${cursorInfo.y}, auto`;
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

    this._offscreen.fill(this.backgroundColor.value);

    // Render Layers
    offCtx.save();
    offCtx.imageSmoothingEnabled = false;
    for (let i = 0; i < this._layers.length; i++) {
      const layer = this._layers[i]

      if (! layer.isVisible) {
        continue;
      }
      const opacity = layer.opacity;
      offCtx.globalAlpha = opacity;

      if (i == this._currentLayerPosition && this._isDrawing) {
        // ストローク中なら曲線を描画してからレイヤーイメージを描画
        this._currentLayerOffscreen.set(layer);
        drawPath(this._currentLayerOffscreen.context, {
          color: this.toolColor.copy(),
          size: this.toolSize,
          composite: this.toolComposite
        }, this._strokeManager.path);
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

    this._needsRender = false;
  }

  /**
   * イベントリスナ登録を中心とした初期化処理
   */
  init() {

    this.cursorOverlay.addEventListener("pointerdown", (ev: PointerEvent) => {
      if (ev.pointerType == "mouse" && ev.button != 0) {
        return;
      }
      if (this._activePointerId != null) {
        this.finishDraw();
        this.cursorOverlay.releasePointerCapture(this._activePointerId);
      }

      this._activePointerId = ev.pointerId;
      this.cursorOverlay.setPointerCapture(this._activePointerId);
      this._mouseX = ev.clientX;
      this._mouseY = ev.clientY;

      if (this._currentTool.name == "spoit") {
        this.execSpoit();
      }
      else if (this._currentTool instanceof CanvasTool.Bucket) {
        const position = this.positionInCanvas(this._mouseX, this._mouseY);
        this.bucketFill(this.currentLayer, position.x, position.y, this.foreColor, {
          closeGap: this._currentTool.closeGap,
          expand: this._currentTool.expand,
          tolerance: this._currentTool.tolerance,
          opacity: this._currentTool.opacity,
        });
      }
      // Pen, Eraser
      else if (
        this._currentTool instanceof CanvasTool.Blush &&
        this.currentLayer.isVisible
      ) {
        this.startDraw(this._currentTool);
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
      
      this._mouseX = ev.clientX;
      this._mouseY = ev.clientY;
      this._isMouseEnter = true;
      
      // Blush
      if (this._isDrawing) {
        this.continueDraw();
      }
      else if (this._currentTool.name == "spoit") {
        this.execSpoit();
      }
      this.requestRenderCursor();
    });
    this.cursorOverlay.addEventListener("pointerleave", (ev: PointerEvent) => {
      if (this._activePointerId == null) {
        this._isMouseEnter = false;
        this.requestRenderCursor();
      }
    });

    this.cursorOverlay.addEventListener("pointerup", (ev: PointerEvent) => {
      if (this._activePointerId != ev.pointerId) {
        return;
      }

      if (this._isDrawing) {
        this.finishDraw();
      }
      this._activePointerId = null;
    });
    this.cursorOverlay.addEventListener("pointercancel", (ev: Event) => {
      if (this._activePointerId == null) {
        return;
      }

      if (this._isDrawing) {
        this.finishDraw();
      }
      this._activePointerId = null;
    });
    
    this._strokeManager.addObserver(this, "update", () => {
      this.requestRender();
    });

    this.reset(this.width, this.height, this.backgroundColor.value, true);
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
    const position = this._layers.indexOf(layer);
    if (position == -1) {
      throw new Error(`Specified layer is not found`);
    }
    this.selectLayerAt(position);
  }

  selectLayerAt(position: number) {
    if (position >= this._layers.length) {
      throw new RangeError(`position must be less than layers.length`);
    }
    this._currentLayerPosition = position;
    this.notify("change-current-layer", {
      position: position,
      layer: this.currentLayer
    });
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
      const oldDoc = new TegakiCanvasDocument(
        this.width, this.height,
        this.layers, this.backgroundColor.value
      );
      const undo = new CanvasAction.ChangeDocument(this, oldDoc);
      this.pushAction(new HistoryNode(action, undo));
    }
  }

  changeBackgroundColor(color: Color.Immutable) {
    const currentBgColor = this.backgroundColor.value;
    if (color.equals(this.backgroundColor.value)) {
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
    if (position > this._layers.length || position < 0) {
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
    const position = this._layers.indexOf(layer);
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
    if (position >= this._layers.length || position < 0) {
      throw new RangeError(`position is out of range`);
    }
    if (this._layers.length == 1) {
      return;
    }
    const layer = this._layers[position];

    const undo = new CanvasAction.AddLayer(this, position, layer);
    const action = new CanvasAction.DeleteLayer(this, position);
    this.pushAction(new HistoryNode(action, undo));
  }

  moveLayer(layer: Layer, newPosition: number) {
    const position = this._layers.indexOf(layer);
    if (position == -1) {
      throw new Error("Specified layer is not found");
    }
    this.moveLayerAt(position, newPosition);
  }

  moveLayerAt(position: number, newPosition: number) {
    if (position >= this._layers.length || position < 0) {
      throw new RangeError(`position is out of range`);
    }
    if (newPosition >= this._layers.length || newPosition < 0) {
      return;
    }
    const undo = new CanvasAction.MoveLayer(this, newPosition, position);
    const action = new CanvasAction.MoveLayer(this, position, newPosition);
    this.pushAction(new HistoryNode(action, undo));
  }

  moveLayerRelatively(layer: Layer, n: number) {
    const position = this._layers.indexOf(layer);
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
    this.fill(this.backgroundColor.value);
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
    const rect = this.createBucketFillImage(fillImage, x, y, fillColor, option);
    if (typeof rect === "undefined" || rect.isEmpty()) {
      offscreenPool.return(fillImage);
      return;
    }
    
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

  private startDraw(blushTool: CanvasTool.Blush) {
    if (this._isDrawing) {
      this.finishDraw();
    }
    this._isDrawing = true;
    this._drawingTool = blushTool;

    const position = this.positionInCanvas(this._mouseX, this._mouseY);
    position.x = position.x | 0;
    position.y = position.y | 0;
    if (this.toolSize%2 == 1) {
      position.x += 0.5, position.y += 0.5;
    }
    this._strokeManager.start(position.x, position.y);
    this.requestRender();
  }

  private continueDraw() {
    if (! this._isDrawing) {
      return;
    }

    const position = this.positionInCanvas(this._mouseX, this._mouseY);
    position.x = position.x | 0;
    position.y = position.y | 0;
    if (this.toolSize%2 == 1) {
      position.x += 0.5, position.y += 0.5;
    }
    this._strokeManager.move(position.x, position.y);
    this.requestRender();
  }

  private finishDraw() {
    if (! this._isDrawing) {
      return;
    }

    if (! this._strokeManager.isActive) {
      return;
    }
    
    this._strokeManager.finish();
    const pathRect = Rect.intersection(
      getPathBoundingRect(this._strokeManager.path, this.toolSize, 1),
      new Rect(0, 0, this.innerWidth, this.innerHeight)
    );

    const layer = this.currentLayer;
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
      this, layer, {
        size: this.toolSize,
        color: this.foreColor.copy(),
        composite: this.toolComposite,
      }, this._strokeManager.path
    );
    
    this.pushAction(new HistoryNode(action, undo));
    this._isDrawing = false;
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

  // --------------------------------------------------

  /**
   * 塗り結果の画像作成
   */
  createBucketFillImage(dst: Offscreen, x: number, y: number, fillColor: Color.Immutable, option?: BucketOption) {
    x = x | 0;
    y = y | 0;
    const tolerance = option?.tolerance || 0;
    const closeGap = option?.closeGap || 0;
    const expand = option?.expand || 0;

    const color = this.getColorAt(x, y);
    if (typeof color === "undefined") {
      return;
    }

    const fillMask = offscreenPool.get().setSize(this._offscreen.width, this._offscreen.height);
    // SVG フィルタを使って指定色が不透明の黒、それ以外が透明な画像を抽出
    {
      const replaceDict: {[key: string]: string} = {
        "[R]": color.r.toString(),
        "[G]": color.g.toString(),
        "[B]": color.b.toString(),
        "[CLOSE_GAP]": (closeGap/2).toString(),
        "[T]": (-3-3*255*255*tolerance/30).toString(),
      };
      drawImageWithSVGFilter(
        fillMask.context,
        this._offscreen.canvas,
        fillMaskFilterCode, replaceDict
      );
    }

    // 隣接領域検索
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

    // マスクから塗りつぶし画像の作成
    {
      const replaceDict: {[key: string]: string} = {
        "[R]": (fillColor.r).toString(),
        "[G]": (fillColor.g).toString(),
        "[B]": (fillColor.b).toString(),
        "[EXPAND]": (expand).toString(),
      };
      drawImageWithSVGFilter(
        dst.context,
        fillMask.canvas,
        fillImageFilterCode, replaceDict
      );
    }
    offscreenPool.return(fillMask);
    return regionToFill.rect.expand(expand);
  }

  /**
   * 取り消し
   */
  undo() {
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
    this.canvas.width = this._width*this._scale;
    this.canvas.height = this._height*this._scale;
    this.cursorOverlay.width = this._width*this._scale;
    this.cursorOverlay.height = this._height*this._scale;
    this.requestRender();
    this.notify("change-size", this);
  }

  /**
   * キャンバス操作の実行
   */
  pushAction(node: HistoryNode) {
    node.action.exec();

    // 短期間の操作の場合、直近の履歴とマージ
    if (this._redoStack.length == 0) {
      const lastNode = this._undoStack.peek();
      if (typeof lastNode !== "undefined" && node.time - lastNode.time < 1000) {
        const mergedNode = node.mergeWith(lastNode);
        if (typeof mergedNode !== "undefined") {
          this._undoStack.pop();
          node = mergedNode;
        }
      }
    }

    this._undoStack.push(node);

    // delete the oldest history
    if (this._undoStack.length > HISTORY_MAX) {
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
  addObserver(observer: Object, name: "change-sub-tool",
    callback: (subTool: SubTool) => void
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
  code: string, replacer: {[key: string]: string;}
) {
  for (let key in replacer) {
    code = code.replaceAll(key, replacer[key]);
  }

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
    _imageDataCanvas = new OffscreenCanvas(width, height);
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
