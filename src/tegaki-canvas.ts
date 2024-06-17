import ObjectPool from "./object-pool";
import Stack from "./stack";
import Color from "./color";

export type PenMode = "pen" | "eracer";

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

export class TegakiCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  private _state: CanvasState;

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

  constructor(width: number = 344, height: number = 135) {
    this._state = new CanvasState();
    this._renderCallback = this.render.bind(this);
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;

    this._offscreen = new Offscreen(width, height);

    const ctx = this.canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("Failed to get CanvasRendering2DContext");
    }
    this.context = ctx;
    this.context.lineCap = "round";
    this.context.lineJoin = "round";
    this.context.imageSmoothingEnabled = false;

    this.init();
  }

  get state() {
    return this._state;
  }

  get width() {
    return this._offscreen.width;
  }

  get height() {
    return this._offscreen.height;
  }

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
  }

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

  requestRender() {
    if (this._needsRender) {
      return;
    }
    this._needsRender = true;
    requestAnimationFrame(this._renderCallback);
  }

  render() {
    const ctx = this.context;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.imageSmoothingEnabled = false;

    ctx.save();
    ctx.scale(this.scale, this.scale);
    ctx.drawImage(this._offscreen.canvas, 0, 0);
    
    // Render current drawing path
    if (this._drawingPath.length > 0) {
      ctx.strokeStyle = this._state.penMode == "pen" ? this._state.foreColor.css() : this._state.backgroundColor.css();
      ctx.lineWidth = this._state.penSize;
      ctx.beginPath();
      const fisrtPoint = this._drawingPath[0];
      ctx.moveTo(fisrtPoint.x, fisrtPoint.y);
      for (let point of this._drawingPath) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }
    ctx.restore();
    // Render cursor
    if (this._isMouseEnter || this._isDrawing) {
      const position = this.positionInCanvas(this._mouseX, this._mouseY);
      ctx.drawImage(
        IMG_CURSOR_PEN,
        (this.scale*position.x) - (IMG_CURSOR_PEN.width/2)|0,
        (this.scale*position.y) - (IMG_CURSOR_PEN.height/2)|0
      );
    }
    this._needsRender = false;
  }

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
    this._offscreen.context.fillStyle = this._state.backgroundColor.css();
    this._offscreen.context.fillRect(0, 0, this.width, this.height);
    this.requestRender();
  }

  fill() {
    this.addHistory();
    this._offscreen.context.fillStyle = this._state.foreColor.css();
    this._offscreen.context.fillRect(0, 0, this.width, this.height);
    this.requestRender();
  }

  clear() {
    this.addHistory();
    this._offscreen.context.fillStyle = this._state.backgroundColor.css();
    this._offscreen.context.fillRect(0, 0, this.width, this.height);
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

    const ctx = this._offscreen.context;
    ctx.strokeStyle = this._state.penMode == "pen" ? this._state.foreColor.css() : this._state.backgroundColor.css();
    ctx.lineWidth = this._state.penSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    const fisrtPoint = this._drawingPath[0];
    ctx.moveTo(fisrtPoint.x, fisrtPoint.y);
    for (let point of this._drawingPath) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    this._isDrawing = false;
    this._drawingPath.length = 0;

    this.requestRender();
  }

  undo() {
    if (this._undoStack.length == 0) {
      return;
    }
    const node = this._undoStack.pop();
    this._redoStack.push(this._offscreen);
    this._offscreen = node;
    this.requestRender();
  }
  redo() {
    if (this._redoStack.length == 0) {
      return;
    }
    const node = this._redoStack.pop();
    this._undoStack.push(this._offscreen);
    this._offscreen = node;
    this.requestRender();
  }

  addHistory() {
    const pool = ObjectPool.sharedPoolFor(Offscreen);
    const newOffscreen = pool.get();
    if (
      newOffscreen.width != this._offscreen.width ||
      newOffscreen.height != this._offscreen.height
    ) {
      newOffscreen.width = this._offscreen.width;
      newOffscreen.height = this._offscreen.height;
    }
    newOffscreen.context.drawImage(this._offscreen.canvas, 0, 0);
    this._undoStack.push(this._offscreen);
    this._offscreen = newOffscreen;

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
    x = ((x - rect.x)*this.width/rect.width) | 0;
    y = ((y - rect.y)*this.height/rect.height) | 0;

    return {x, y};
  }
}

export default TegakiCanvas;
