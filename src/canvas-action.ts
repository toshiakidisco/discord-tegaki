import Offscreen from "./canvas-offscreen";
import Color from "./color";
import ObjectPool from "./object-pool";
import TegakiCanvas from "./tegaki-canvas";

export type BlushPath = {x: number; y: number;}[];

export type BlushState = {
  size: number;
  readonly color: Color.Immutable;
}

const pool = ObjectPool.sharedPoolFor(Offscreen);

/**
 * キャンバス操作の抽象化クラス
 */
export abstract class CanvasAction {
  readonly canvas: TegakiCanvas;
  constructor(canvas: TegakiCanvas) {
    this.canvas = canvas;
  }

  abstract exec(): void;
  dispose(): void {};
}

/**
 * 操作: Null
 */
export class CanvasActionNone extends CanvasAction { exec(): void;
  exec(): void {};
}


/**
 * 操作: 画像描画
 */
export class CanvasActionDrawImage extends CanvasAction {
  private _image: Offscreen;
  private _dx: number;
  private _dy: number;

  constructor(
    canvas: TegakiCanvas,
    image: Offscreen, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number
  ) {
    super(canvas);
    this._image = pool.get();
    this._image.width = sw;
    this._image.height = sh;
    this._image.context.drawImage(image.canvas, sx, sy, sw, sh, 0, 0, sw, sh);

    this._dx = dx;
    this._dy = dy;
  }

  exec(): void {
    const layer = this.canvas.image;
    layer.context.drawImage(this._image.canvas, this._dx, this._dy);
  }

  dispose(): void {
    pool.return(this._image);
  }
}

/**
 * 操作: キャンバスサイズ変更
 */
export class CanvasActionResize extends CanvasAction {
  private _width: number;
  private _height: number;
  private _backgroundColor: Color.Immutable;

  constructor(
    canvas: TegakiCanvas, width: number, height: number,
    background: Color.Immutable = Color.transparent
  ) {
    super(canvas);
    this._width = width;
    this._height = height;
    this._backgroundColor = background.copy();
  }

  exec(): void {
    const layer = this.canvas.image;
    const image = pool.get().set(layer);
    layer.width = this._width*this.canvas.innerScale;
    layer.height = this._height*this.canvas.innerScale;
    layer.context.fillStyle = this._backgroundColor.css();
    layer.context.fillRect(0, 0, layer.width, layer.height);
    layer.context.drawImage(image.canvas, 0, 0);
    pool.return(image);
    this.canvas.updateCanvasSize();
  }
}

/**
 * 操作: ブラシ描画
 */
export class CanvasActionDrawPath extends CanvasAction {
  private _blush: BlushState;
  private _path: BlushPath;

  constructor(canvas: TegakiCanvas, blush: BlushState, path: BlushPath) {
    super(canvas);
    this._blush = blush;
    this._path = Array.from(path);    
  }

  exec() {
    const ctx = this.canvas.image.context;
 
    drawPath(ctx, this._blush, this._path, this.canvas.innerScale);
  }
}

/**
 * 操作: リサイズ取り消し
 */
export class CanvasActionUndoResize extends CanvasAction {
  _layers: Offscreen[];
  _width: number;
  _height: number;

  constructor(canvas: TegakiCanvas) {
    super(canvas);
    this._layers = [pool.get().set(canvas.image)];
    this._width = canvas.width;
    this._height = canvas.height;
  }

  exec(): void {
    const layer = this.canvas.image;
    layer.set(this._layers[0]);
    this.canvas.updateCanvasSize();
  }

  dispose(): void {
    for (let layer of this._layers) {
      pool.return(layer);
    }
  }
}

/**
 * 操作: 反転
 */
export class CanvasActionFlip extends CanvasAction {
  exec() {
    const layer = this.canvas.image;

    const image = pool.get().set(layer);
    layer.clear();
    layer.context.save();
    layer.context.scale(-1, 1);
    layer.context.drawImage(image.canvas, - layer.width, 0);
    layer.context.restore();

    pool.return(image);
  }
}

/**
 * 操作: 塗りつぶし
 */
export class CanvasActionFill extends CanvasAction {
  private readonly _color: Color.Immutable;

  constructor(canvas: TegakiCanvas, color: Color.Immutable) {
    super(canvas);
    this._color = color.copy();
  }

  exec() {
    const layer = this.canvas.image;
    layer.context.fillStyle = this._color.css();
    layer.context.fillRect(0, 0, layer.width, layer.height);
  }
}

/**
 * 操作: 消去
 */
export class CanvasActionClear extends CanvasAction {
  private readonly _color: Color.Immutable;

  constructor(canvas: TegakiCanvas, color: Color.Immutable) {
    super(canvas);
    this._color = color.copy();
  }

  exec() {
    const layer = this.canvas.image;
    layer.clear();
  }
}

export function drawPath(ctx: CanvasRenderingContext2D, blush: BlushState, path: {x: number, y: number}[], innerScale = 1) {
  if (path.length == 0) {
    return;
  }
  
  ctx.save();
  ctx.scale(innerScale, innerScale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = blush.color.css();
  ctx.lineWidth = blush.size;

  ctx.beginPath();
  const fisrtPoint = path[0];
  ctx.moveTo(fisrtPoint.x, fisrtPoint.y);
  for (let i = 1; i < path.length; i++) {
    const point = path[i]
    ctx.lineTo(point.x, point.y);
  }

  ctx.globalAlpha = 0.6;
  ctx.stroke();

  ctx.globalAlpha = 0.94;
  ctx.lineWidth -= ctx.lineWidth == 1 ? 0.4 : 1.4;
  ctx.stroke();

  ctx.restore();
}

export default CanvasAction;



