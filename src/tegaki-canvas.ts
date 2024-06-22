import ObjectPool from "./object-pool";
import Stack from "./stack";
import Color from "./color";
import Subject from "./subject";

import cursorFilterSvgCode from "raw-loader!./cursor-filter.svg";
import { parseSvg } from "./dom";
import { getAssetUrl } from "./asset";

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

class Offscreen {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;

  constructor(width: number = 100, height: number = 100) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;

    const ctx = this.canvas.getContext("2d");
    if (ctx == null) {
      throw new Error("Failed to get OffscreenCanvasRenderingContext2D");
    }
    this.context = ctx;
    this.context.lineCap = "round";
    this.context.lineJoin = "round";
  }

  copy() {
    const copy = new Offscreen(this.width, this.height);
    copy.context.drawImage(this.canvas, 0, 0);
    return copy;
  }

  get width() {
    return this.canvas.width;
  }
  set width(value: number) {
    this.canvas.width = value;
  }

  get height() {
    return this.canvas.height;
  }
  set height(value: number) {
    this.canvas.height = value;
  }
}

const HISTORY_MAX = 10;

export class TegakiCanvas extends Subject {
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
  private _drawingPath: {x: number; y: number;}[] = [];
  private _activePointerId: number | null = null;

  private _needsRender: boolean = false;
  private _renderCallback: FrameRequestCallback;

  private _undoStack: Stack<Offscreen> = new Stack();
  private _redoStack: Stack<Offscreen> = new Stack();

  private _spoitContext: CanvasRenderingContext2D;

  constructor(init: CanvasInit) {
    super();

    this._state = new CanvasState();
    this._width = init.width;
    this._height = init.height;
    this._innerScale = 1;
    this._state.foreColor.set(init.foreColor);
    this._state.backgroundColor.set(init.backgroundColor);

    this._renderCallback = this.render.bind(this);
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this._image = new Offscreen(this.innerWidth, this.innerHeight);
    this._offscreen = new Offscreen(this.innerWidth, this.innerHeight);

    const ctx = this.canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("Failed to get CanvasRendering2DContext");
    }
    this.context = ctx;

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
    this.canvas.width = this.width*this.scale;
    this.canvas.height = this.height*this.scale;
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
    const ctx = this._offscreen.context;
    
    if (
      this._offscreen.width != this._image.width ||
      this._offscreen.height != this._image.height
    ) {
      this._offscreen.width = this._image.width;
      this._offscreen.height = this._image.height;
    }

    // Render image
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this._image.canvas, 0, 0);
    
    // Render current drawing path
    this.drawPath(ctx, this._drawingPath);

    // Render offscreen to canvas
    this.context.save();
    this.context.scale(this._scale/this._innerScale, this._scale/this._innerScale);
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = "high";
    this.context.drawImage(this._offscreen.canvas, 0, 0);
    this.context.restore();

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

      this.context.save();
      // カーソルをクリップ領域として描く
      // 円形
      if (displayPenSize >= 8) {
        this.context.beginPath();
        this.context.arc(
          position.x + offset,
          position.y + offset,
          displayPenSize/2+1.1, 0, 2*Math.PI
        );
        this.context.arc(
          position.x + offset,
          position.y + offset,
          displayPenSize/2+0.4, 0, 2*Math.PI
        );
        this.context.clip("evenodd");

        cl = position.x - displayPenSize/2 - 2;
        ct = position.y - displayPenSize/2 - 2;
        cw = ch = displayPenSize + 4;
      }
      // 十字
      else {
        this.context.beginPath();
        this.context.rect(position.x,   position.y,   1, 1);
        this.context.rect(position.x-9, position.y,   5, 1);
        this.context.rect(position.x+5, position.y,   5, 1);
        this.context.rect(position.x,   position.y-9, 1, 5);
        this.context.rect(position.x,   position.y+5, 1, 5);
        this.context.clip();

        cl = position.x - 9;
        ct = position.y - 9;
        cw = ch = 19;
      }
      // クリップ領域に描画済みの画像を反転フィルタをかけて再描画
      this.context.filter = "url(#tegaki-canvas-cursor-filter)";
      this.context.imageSmoothingEnabled = false;
      this.context.drawImage(this.canvas, cl, ct, cw, ch, cl, ct, cw, ch);
      this.context.restore();
    }

    this._needsRender = false;
  }

  /**
   * イベントリスナ登録を中心とした初期化処理
   */
  init() {

    this.canvas.addEventListener("pointerdown", (ev: PointerEvent) => {
      if (ev.pointerType == "mouse" && ev.button != 0) {
        return;
      }
      if (this._activePointerId != null) {
        this.finishDraw();
        this.canvas.releasePointerCapture(this._activePointerId);
      }

      this._activePointerId = ev.pointerId;
      this.canvas.setPointerCapture(this._activePointerId);
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
    this.canvas.addEventListener("pointermove", (ev: PointerEvent) => {
      if (this._activePointerId == null) {
        this._mouseX = ev.clientX;
        this._mouseY = ev.clientY;
        this._isMouseEnter = true;
        this.requestRender();
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
      else {
        this.requestRender();
      }
    });
    this.canvas.addEventListener("pointerleave", (ev: PointerEvent) => {
      if (this._activePointerId == null) {
        this._isMouseEnter = false;
        this.requestRender();
      }
    });

    this.canvas.addEventListener("pointerup", (ev: PointerEvent) => {
      if (this._activePointerId != ev.pointerId) {
        return;
      }

      if (this._isDrawing) {
        this.finishDraw();
      }
      this._activePointerId = null;
    });
    this.canvas.addEventListener("pointercancel", (ev: Event) => {
      if (this._activePointerId == null) {
        return;
      }

      if (this._isDrawing) {
        this.finishDraw();
      }
      this.canvas.releasePointerCapture(this._activePointerId);
      this._activePointerId = null;
    });
    
    this._state.addObserver(this, "change-sub-tool", (subTool: SubTool) => {
      if (subTool == "none") {
        this.canvas.style.cursor = "none";
      }
      else {
        const toolCursor = toolCursors[subTool];
        this.canvas.style.cursor = `url(${getAssetUrl("asset/cursor-"+subTool+".cur")}) ${toolCursor.x} ${toolCursor.y}, auto`;
      }
      this.notify("change-sub-tool", subTool);
      this.requestRender();
    });

    // Clear canvas
    this.clear(false);
  }

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
  fill() {
    this.addHistory();
    this._image.context.fillStyle = this._state.foreColor.css();
    this._image.context.fillRect(0, 0, this._image.width, this._image.height);
    this.requestRender();
  }

  /**
   * 背景色での塗りつぶし
   * @param addHistory 操作前にアンドゥ履歴に追加するか
   */
  clear(addHistory: boolean = true) {
    if (addHistory) {
      this.addHistory();
    }
    this._image.context.fillStyle = this._state.backgroundColor.css();
    this._image.context.fillRect(0, 0, this._image.width, this._image.height);
    this.requestRender();
  }

  private startDraw() {
    if (this._isDrawing) {
      this.finishDraw();
    }
    this._isDrawing = true;

    const position = this.positionInCanvas(this._mouseX, this._mouseY);
    position.x = position.x;
    position.y = position.y;
    if (this.toolSize%2 == 1) {
      position.x += 0.5, position.y += 0.5;
    }
    this._drawingPath.push(position);
    
    this.requestRender();
  }

  private continueDraw() {
    if (! this._isDrawing) {
      return;
    }

    const position = this.positionInCanvas(this._mouseX, this._mouseY);
    position.x = position.x;
    position.y = position.y;
    if (this.toolSize%2 == 1) {
      position.x += 0.5, position.y += 0.5;
    }
    this._drawingPath.push(position);
    
    this.requestRender();
  }

  private finishDraw() {
    if (! this._isDrawing) {
      return;
    }

    if (this._drawingPath.length == 0) {
      return;
    }
    this.addHistory();
    this.drawPath(this._image.context, this._drawingPath);
    this._isDrawing = false;
    this._drawingPath.length = 0;

    this.requestRender();
  }

  /**
   * パスの描画
   */
  private drawPath(ctx: CanvasRenderingContext2D, path: {x: number, y: number}[]) {
    if (path.length == 0) {
      return;
    }
    
    ctx.save();
    ctx.scale(this._innerScale, this._innerScale);
    ctx.lineCap = "round";
    ctx.lineJoin = "bevel";
    if (this._state.penMode == "pen") {
      ctx.strokeStyle = this._state.foreColor.css();
      ctx.lineWidth = this._state.penSize;
    }
    else {
      ctx.strokeStyle = this._state.backgroundColor.css();
      ctx.lineWidth = this._state.eraserSize;
    }
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    const fisrtPoint = path[0];
    ctx.moveTo(fisrtPoint.x, fisrtPoint.y);
    for (let i = 1; i < path.length; i++) {
      const point = path[i]
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.94;
    ctx.lineWidth -= ctx.lineWidth == 1 ? 0.4 : 1.4;
    ctx.beginPath();
    ctx.moveTo(fisrtPoint.x, fisrtPoint.y);
    for (let i = 1; i < path.length; i++) {
      const point = path[i]
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();

    ctx.filter = "none";
    ctx.fillStyle = "#fff";
    for (let point of path) {
    }


    ctx.restore();
  }

  /**
   * 画像の左右反転
   */
  flip() {
    this.addHistory();

    const pool = ObjectPool.sharedPoolFor(Offscreen);
    const oldImage = this._image;
    const image = pool.get();
    image.width = oldImage.width;
    image.height = oldImage.height;
    image.context.save();
    image.context.scale(-1, 1);
    image.context.drawImage(oldImage.canvas, - image.width, 0);
    image.context.restore();
    this._image = image;
    pool.return(oldImage);

    this.requestRender();
  }

  resize(width: number, height: number) {
    width = width | 0;
    height = height | 0;
    if (width < 1) {
      throw new RangeError("width must be greater than 0");
    }
    if (height < 1) {
      throw new RangeError("height must be greater than 0");
    }

    this.addHistory();

    const pool = ObjectPool.sharedPoolFor(Offscreen);
    const oldImage = this._image;
    const image = pool.get();
    image.width = width*this.innerScale;
    image.height = height*this.innerScale;
    image.context.fillStyle = this._state.backgroundColor.css();
    image.context.fillRect(0, 0, image.width, image.height);
    image.context.drawImage(oldImage.canvas, 0, 0);
    this._image = image;
    pool.return(oldImage);
    this._refrectImageSizeToCanvasSize();
    this.requestRender();
  }

  undo() {
    if (this._undoStack.length == 0) {
      return;
    }
    const node = this._undoStack.pop();
    this._redoStack.push(this._image);
    this._image = node;
    this._refrectImageSizeToCanvasSize();
    this.requestRender();
    this.notify("update-history", this);
  }
  redo() {
    if (this._redoStack.length == 0) {
      return;
    }
    const node = this._redoStack.pop();
    this._undoStack.push(this._image);
    this._image = node;
    this._refrectImageSizeToCanvasSize();
    this.requestRender();
    this.notify("update-history", this);
  }

  /**
   * 現在のimageプロパティから、キャンバスサイズを反映する。
   */
  private _refrectImageSizeToCanvasSize() {
    const w = this._image.width/this.innerScale;
    const h = this._image.height/this.innerScale;
    if (this._width == w && this._height == h) {
      return;
    }
    this._width = this._image.width/this.innerScale;
    this._height = this._image.height/this.innerScale;
    this.canvas.width = this._width*this._scale;
    this.canvas.height = this._height*this._scale;

    this.notify("size-changed", this);
  }

  /**
   * 現在の画像をアンドゥ履歴に追加
   */
  addHistory() {
    const pool = ObjectPool.sharedPoolFor(Offscreen);
    const node = pool.get();
    if (
      node.width != this._image.width ||
      node.height != this._image.height
    ) {
      node.width = this._image.width;
      node.height = this._image.height;
    }
    node.context.drawImage(this._image.canvas, 0, 0);
    this._undoStack.push(node);

    // delete the oldest history
    if (this._undoStack.length > HISTORY_MAX) {
      let oldestNode = this._undoStack.shift();
      pool.return(oldestNode);
    }

    // clean redo stack
    while (this._redoStack.length > 0) {
      let redoNode = this._redoStack.pop();
      pool.return(redoNode);
    }

    this.notify("update-history", this);
  }

  /**
   * クライアント座標をCanvas内のローカル座標に変換する。
   * @param x 
   * @param y 
   * @returns 
   */
  positionInCanvas(x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect();
    x = ((x - rect.x)*this.innerWidth/rect.width) | 0;
    y = ((y - rect.y)*this.innerHeight/rect.height) | 0;

    return {x, y};
  }
}

export default TegakiCanvas;
