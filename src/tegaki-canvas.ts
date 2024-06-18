import ObjectPool from "./object-pool";
import Stack from "./stack";
import Color from "./color";
import Subject from "./subject";

export type PenMode = "pen" | "eracer";

type CanvasInit = {
  width: number,
  height: number,
  foreColor: Color.Immutable,
  backgroundColor: Color.Immutable
};

class CanvasState {
  foreColor: Color = new Color(128, 0, 0);
  penMode: PenMode = "pen";
  backgroundColor: Color = new Color(240, 224, 214);
  penSize: number = 4;
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

const IMG_CURSOR_PEN = new Image();
IMG_CURSOR_PEN.src = chrome.runtime.getURL("asset/cursor-pen.png");

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
    if (this._drawingPath.length > 0) {
      ctx.save();
      ctx.scale(this.innerScale, this.innerScale);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = this._state.penSize;
      ctx.strokeStyle = this._state.penMode == "pen" ? this._state.foreColor.css() : this._state.backgroundColor.css();
      ctx.beginPath();
      const fisrtPoint = this._drawingPath[0];
      ctx.moveTo(fisrtPoint.x, fisrtPoint.y);
      for (let point of this._drawingPath) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Render offscreen to canvas
    this.context.save();
    this.context.scale(this._scale/this._innerScale, this._scale/this._innerScale);
    this.context.imageSmoothingEnabled = false;
    this.context.imageSmoothingQuality = "high";
    this.context.drawImage(this._offscreen.canvas, 0, 0);
    this.context.restore();

    // Render cursor
    if (this._isMouseEnter || this._isDrawing) {
      const position = this.positionInCanvas(this._mouseX, this._mouseY);
      this.context.drawImage(
        IMG_CURSOR_PEN,
        (this.scale*position.x) - (IMG_CURSOR_PEN.width/2)|0,
        (this.scale*position.y) - (IMG_CURSOR_PEN.height/2)|0
      );
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

      this._mouseX = ev.clientX;
      this._mouseY = ev.clientY;
      this._activePointerId = ev.pointerId;
      this.canvas.setPointerCapture(this._activePointerId);
      this.startDraw();
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
      this.continueDraw();
      this.requestRender();
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

      this.finishDraw();
      this.requestRender();
      this.canvas.releasePointerCapture(this._activePointerId);
      this._activePointerId = null;
    });
    this.canvas.addEventListener("pointercancel", (ev: Event) => {
      if (this._activePointerId == null) {
        return;
      }
      this.finishDraw();
      this.requestRender();
      this.canvas.releasePointerCapture(this._activePointerId);
      this._activePointerId = null;
    });

    // Clear canvas
    this._image.context.fillStyle = this._state.backgroundColor.css();
    this._image.context.fillRect(0, 0, this._image.width, this._image.height);
    this.requestRender();
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
   */
  clear() {
    this.addHistory();
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
    if (this._state.penSize%2 == 1) {
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
    if (this._state.penSize%2 == 1) {
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

    const ctx = this._image.context;
    ctx.save();
    ctx.scale(this._innerScale, this._innerScale);
    ctx.strokeStyle = this._state.penMode == "pen" ? this._state.foreColor.css() : this._state.backgroundColor.css();
    ctx.lineWidth = this._state.penSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const fisrtPoint = this._drawingPath[0];
    ctx.moveTo(fisrtPoint.x, fisrtPoint.y);
    for (let point of this._drawingPath) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.restore();
    this._isDrawing = false;
    this._drawingPath.length = 0;

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
    image.width = width;
    image.height = height;
    image.context.fillStyle = this._state.backgroundColor.css();
    image.context.fillRect(0, 0, width, height);
    image.context.drawImage(oldImage.canvas, 0, 0);
    this._image = image;
    pool.return(this._image);
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
  }

  /**
   * 現在のimageプロパティから、キャンバスサイズを反映する。
   */
  private _refrectImageSizeToCanvasSize() {
    this._width = this._image.width/this.innerScale;
    this._height = this._image.height/this.innerScale;
    this.canvas.width = this._width*this._scale;
    this.canvas.height = this._height*this._scale;
  }

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
  }

  /**
   * クライアント座標をCanvas内のローカル座標に変換する。
   * @param x 
   * @param y 
   * @returns 
   */
  positionInCanvas(x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect();
    x = ((x - rect.x)*this.width/rect.width);
    y = ((y - rect.y)*this.height/rect.height);

    return {x, y};
  }
}

export default TegakiCanvas;
