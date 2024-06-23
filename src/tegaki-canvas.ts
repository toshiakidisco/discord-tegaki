import ObjectPool from "./object-pool";
import Stack from "./stack";
import Color from "./color";
import Subject from "./subject";

import cursorFilterSvgCode from "raw-loader!./cursor-filter.svg";
import { parseSvg } from "./dom";
import { getAssetUrl } from "./asset";
import Offscreen from "./canvas-offscreen";
import CanvasAction, { BlushPath, CanvasActionDrawImage, CanvasActionFill, CanvasActionFlip, CanvasActionNone, CanvasActionDrawPath, CanvasActionResize, CanvasActionUndoResize, drawPath, getPathBoundingRect } from "./canvas-action";
import { Rect } from "./rect";
import StrokeManager from "./stroke-manager";

export type PenMode = "pen" | "eraser";
export type SubTool = "none" | "spoit" | "bucket";

// カーソル描画用のフィルタの読み込み
const cursorFilterSvg = parseSvg(cursorFilterSvgCode);
document.body.appendChild(cursorFilterSvg);

type CanvasInit = {
  width: number,
  height: number,
  foreColor: Color.Immutable,
  backgroundColor: Color.Immutable
};

const toolCursors: {[tool: string]: {x: number; y: number;}} = {
  "spoit": {x: 1, y: 14},
}

class CanvasState extends Subject {
  readonly foreColor: Color = new Color(128, 0, 0);
  readonly backgroundColor: Color = new Color(240, 224, 214);
  penMode: PenMode = "pen";
  _subTool: SubTool = "none";
  penSize: number = 4;
  eraserSize: number = 4;

  constructor() {
    super();
  }

  get subTool() {
    return this._subTool;
  }
  set subTool(value: SubTool) {
    if (this._subTool == value) {
      return;
    }
    this._subTool = value;
    this.notify("change-sub-tool", value);
  }
}

const HISTORY_MAX = 20;
class HistoryNode {
  action: CanvasAction;
  undo: CanvasAction;

  constructor(action: CanvasAction, undo: CanvasAction) {
    this.action = action;
    this.undo = undo;
  }

  dispose() {
    this.action.dispose();
    this.undo.dispose();
  }
};

export class TegakiCanvas extends Subject {
  readonly element: HTMLDivElement;
  readonly cursorOverlay: HTMLCanvasElement;
  readonly cursorContext: CanvasRenderingContext2D;
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  private _state: CanvasState;

  private _width: number;
  private _height: number;
  private _innerScale: number;

  private _image: Offscreen;
  private _offscreen: Offscreen;
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
  private _spoitContext: CanvasRenderingContext2D;

  constructor(init: CanvasInit) {
    super();

    this._state = new CanvasState();
    this._width = init.width;
    this._height = init.height;
    this._innerScale = 1;
    this._state.foreColor.set(init.foreColor);
    this._state.backgroundColor.set(init.backgroundColor);

    // Create Elements
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



    this._image = new Offscreen(this.innerWidth, this.innerHeight);
    this._offscreen = new Offscreen(this.innerWidth, this.innerHeight);

    // Create 2D context for spoit
    const spoitCanvas = document.createElement("canvas");
    spoitCanvas.width = 1;
    spoitCanvas.height = 1;
    const spoitContext = spoitCanvas.getContext("2d", {willReadFrequently: true});
    if (spoitContext === null) {
      throw new Error("Failed to get CanvasRendering2DContext");
    }
    this._spoitContext = spoitContext;

    this.init();
  }

  get image() {
    return this._image;
  }

  get state() {
    return this._state;
  }

  get width() {
    return this._width;
  }

  get height() {
    return this._height;
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
    if (this._state.penMode == "pen") {
      return this._state.penSize;
    }
    else {
      return this._state.eraserSize;
    }
  }

  /**
   * 選択中ツールの色
   */
  get toolColor(): Color.Immutable {
    if (this._state.penMode == "pen") {
      return this._state.foreColor;
    }
    else {
      return this._state.backgroundColor;
    }
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
    a.setAttribute("href", this._image.canvas.toDataURL());
    a.click();
  }

  /**
   * クリップボードに画像をコピー
   */
  copyToClipboard(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._image.canvas.toBlob((blob) => {
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
    // Render cursor
    if (this._state.subTool == "none" && (this._isMouseEnter || this._isDrawing)) {
      const toolSize = this.toolSize;
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
    
    if (
      this._offscreen.width != this._image.width ||
      this._offscreen.height != this._image.height
    ) {
      this._offscreen.width = this._image.width;
      this._offscreen.height = this._image.height;
    }
    offCtx.clearRect(0, 0, this.width, this.height);

    // Render image
    offCtx.imageSmoothingEnabled = false;
    offCtx.drawImage(this._image.canvas, 0, 0);
    
    // Render current drawing path
    if (this._isDrawing) {
      drawPath(offCtx, {color: this.toolColor.copy(), size: this.toolSize}, this._strokeManager.path);
    }

    // Render offscreen to canvas
    this.context.save();
    this.context.scale(this._scale/this._innerScale, this._scale/this._innerScale);
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = "high";
    this.context.drawImage(this._offscreen.canvas, 0, 0);
    this.context.restore();

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

      if (this._state.subTool == "spoit") {
        this.execSpoit();
      }
      // Pen, Eraser
      else {
        this.startDraw();
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
      
      if (this._state.subTool == "spoit") {
        this.execSpoit();
      }
      // Pen, Eraser
      else if (this._isDrawing) {
        this.continueDraw();
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
    
    this._state.addObserver(this, "change-sub-tool", (subTool: SubTool) => {
      if (subTool == "none") {
        this.cursorOverlay.style.cursor = "none";
      }
      else {
        const toolCursor = toolCursors[subTool];
        this.cursorOverlay.style.cursor = `url(${getAssetUrl("asset/cursor-"+subTool+".cur")}) ${toolCursor.x} ${toolCursor.y}, auto`;
      }
      this.notify("change-sub-tool", subTool);
      this.requestRender();
    });
    
    this._strokeManager.addObserver(this, "update", () => {
      this.requestRender();
    });

    // Clear canvas
    this._image.context.fillStyle = this._state.backgroundColor.css();
    this._image.context.fillRect(0, 0, this._image.width, this._image.height);
    this.requestRender();
  }

  /**
   * 指定座標の色を現在のツール色にする
   * @param x 
   * @param y 
   */
  execSpoit(x?: number, y?: number) {
    if (typeof x == "undefined" || typeof y == "undefined") {
      const position = this.positionInCanvas(this._mouseX, this._mouseY);
      x = position.x;
      y = position.y;
    }
    x = x | 0;
    y = y | 0;
    if (x < 0 || x >= this._image.width || y < 0 || y >= this._image.height) {
      return void(0);
    }
    
    try {
      this._spoitContext.drawImage(this._image.canvas, x, y, 1, 1, 0, 0, 1, 1);
      const imageData = this._spoitContext.getImageData(0, 0, 1, 1);
      const data = imageData.data;
      const color = new Color(data[0], data[1], data[2]);
      if (this._state.penMode == "pen") {
        this._state.foreColor.set(color);
      }
      else {
        this._state.backgroundColor.set(color);
      }
      this.notify("spoit", {tool: this._state.penMode, color: color});
    }
    catch {
    }
  }


  /**
   * 描画色での塗りつぶし
   */
  fill(color?: Color.Immutable) {
    if (typeof color == "undefined") {
      color = this._state.foreColor;
    }

    const undo = new CanvasActionDrawImage(
      this,
      this._image, 0, 0, this._image.width, this._image.height,
      0, 0
    );

    const action = new CanvasActionFill(this, color)
    this.pushAction(new HistoryNode(action, undo));
  }

  /**
   * 背景色での塗りつぶし
   * @param pushAction 操作前にアンドゥ履歴に追加するか
   */
  fillWithBackgroundColor() {
    this.fill(this._state.backgroundColor);
  }

  private startDraw() {
    if (this._isDrawing) {
      this.finishDraw();
    }
    this._isDrawing = true;

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
    let undo: CanvasAction;
    if (pathRect.isEmpty()) {
      undo = new CanvasActionNone(this);
    }
    else {
      undo = new CanvasActionDrawImage(
        this, this._image,
        pathRect.x, pathRect.y, pathRect.width, pathRect.height,
        pathRect.x, pathRect.y
      );
    }
    const action = new CanvasActionDrawPath(
      this, {
        size: this.toolSize,
        color: this.toolColor.copy(),
      }, this._strokeManager.path
    );
    
    this.pushAction(new HistoryNode(action, undo));
    this._isDrawing = false;
  }

  /**
   * 画像の左右反転
   */
  flip() {
    const undo = new CanvasActionFlip(this);
    const action = new CanvasActionFlip(this);
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
      undo = new CanvasActionResize(this, this.width, this.height);
    }
    else {
      undo = new CanvasActionUndoResize(this);
    }
    const action = new CanvasActionResize(this, width, height, this._state.backgroundColor);
    this.pushAction(new HistoryNode(action, undo));
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
   * 現在のimageプロパティから、キャンバスサイズを反映する。
   */
  updateCanvasSize() {
    const w = this._image.width/this.innerScale;
    const h = this._image.height/this.innerScale;
    if (this._width == w && this._height == h) {
      //return;
    }
    this._width = this._image.width/this.innerScale;
    this._height = this._image.height/this.innerScale;
    this.canvas.width = this._width*this._scale;
    this.canvas.height = this._height*this._scale;
    this.cursorOverlay.width = this._width*this._scale;
    this.cursorOverlay.height = this._height*this._scale;
    this.requestRender();
    this.notify("size-changed", this);
  }

  /**
   * キャンバス操作の実行
   */
  pushAction(node: HistoryNode) {
    node.action.exec();
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

export default TegakiCanvas;
