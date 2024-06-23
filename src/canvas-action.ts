import { buffer } from "stream/consumers";
import Offscreen from "./canvas-offscreen";
import Color from "./color";
import ObjectPool from "./object-pool";
import { Rect } from "./rect";
import TegakiCanvas from "./tegaki-canvas";
import { Layer } from "./canvas-layer";

export type BlushPath = {x: number; y: number;}[];

export type BlushState = {
  size: number;
  readonly color: Color;
  composite: GlobalCompositeOperation;
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
export class CanvasActionNone extends CanvasAction {
  exec(): void {};
}

/**
 * 操作: レイヤー追加
 */
export class CanvasActionAddLayer extends CanvasAction {
  #position: number;
  #layer: Layer;
  constructor (canvas: TegakiCanvas, position: number, layer: Layer){
    super(canvas);
    this.#position = position;
    this.#layer = layer;
  }
  
  exec(): void {
    this.canvas.layers.splice(this.#position, 0, this.#layer);
    this.canvas.notify("add-layer", {
      layer: this.#layer,
      position: this.#position,
    });
    this.canvas.selectLayerAt(this.#position);
  };
}

/**
 * 操作: レイヤー削除
 */
export class CanvasActionDeleteLayer extends CanvasAction {
  #position: number;
  constructor (canvas: TegakiCanvas, position: number){
    super(canvas);
    this.#position = position;
  }
  
  exec(): void {
    const deletedLayer = this.canvas.layers.splice(this.#position, 1)[0];
    this.canvas.notify("delete-layer", {
      layer: deletedLayer,
      position: this.#position,
    });
    this.canvas.selectLayerAt(Math.max(0, this.#position - 1));
  }
}

/**
 * 操作: レイヤー移動
 */
export class CanvasActionMoveLayer extends CanvasAction {
  #position: number;
  #newPosition: number;

  constructor (canvas: TegakiCanvas, position: number, newPosition: number){
    super(canvas);
    this.#position = position;
    this.#newPosition = newPosition;
  }
  
  exec(): void {
    const layer = this.canvas.layers.splice(this.#position, 1)[0];
    this.canvas.layers.splice(this.#newPosition, 0, layer);

    this.canvas.notify("move-layer", {
      layer: layer,
      from: this.#position,
      to: this.#newPosition,
    });
    this.canvas.selectLayer(layer);
  }
}


/**
 * 操作: 画像描画
 */
export class CanvasActionDrawImage extends CanvasAction {
  private _layer: Layer;
  private _image: Offscreen;
  private _dx: number;
  private _dy: number;

  constructor(
    canvas: TegakiCanvas, layer: Layer,
    image: Offscreen, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number
  ) {
    super(canvas);
    this._layer = layer;
    this._image = pool.get();
    this._image.width = sw;
    this._image.height = sh;
    this._image.context.drawImage(image.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    this._dx = dx;
    this._dy = dy;
  }

  exec(): void {
    this._layer.context.clearRect(this._dx, this._dy, this._image.width, this._image.height);
    this._layer.context.drawImage(this._image.canvas, this._dx, this._dy);
    this._layer.notify("update");
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
    const image = pool.get();
    for (let layer of this.canvas.layers) {
      image.set(layer);
      layer.width = this._width*this.canvas.innerScale;
      layer.height = this._height*this.canvas.innerScale;
      layer.clear();
      layer.context.drawImage(image.canvas, 0, 0);
      layer.notify("update");
    }
    pool.return(image);

    this.canvas.setSize(this._width, this._height);
    this.canvas.updateCanvasSize();
  }
}

/**
 * 操作: ブラシ描画
 */
export class CanvasActionDrawPath extends CanvasAction {
  private _layer: Layer;
  private _blush: BlushState;
  private _path: BlushPath;

  constructor(canvas: TegakiCanvas, layer: Layer, blush: BlushState, path: BlushPath) {
    super(canvas);
    this._layer = layer;
    this._blush = blush;
    this._path = Array.from(path);    
  }

  exec() {
    const ctx = this._layer.context;
    drawPath(ctx, this._blush, this._path, this.canvas.innerScale);
    this._layer.notify("update");
  }
}

/**
 * 操作: リサイズ取り消し
 */
export class CanvasActionUndoResize extends CanvasAction {
  _layerImages: Offscreen[];
  _width: number;
  _height: number;

  constructor(canvas: TegakiCanvas) {
    super(canvas);
    this._layerImages = [];
    for (const layer of canvas.layers) {
      this._layerImages.push(pool.get().set(layer));
    }
    this._width = canvas.width;
    this._height = canvas.height;
  }

  exec(): void {
    for (let i = 0; i < this.canvas.layers.length; i++) {
      const layer = this.canvas.layers[i];
      layer.set(this._layerImages[i]);
      layer.notify("update");
    }
    this.canvas.setSize(this._width, this._height);
    this.canvas.updateCanvasSize();
  }

  dispose(): void {
    for (let image of this._layerImages) {
      pool.return(image);
    }
  }
}

/**
 * 操作: 反転
 */
export class CanvasActionFlip extends CanvasAction {
  exec() {
    const image = pool.get();
    for (const layer of this.canvas.layers) {
      image.set(layer);
      layer.clear();
      layer.context.save();
      layer.context.scale(-1, 1);
      layer.context.drawImage(image.canvas, - layer.width, 0);
      layer.context.restore();
      layer.notify("update");
    }
    pool.return(image);
  }
}

/**
 * 操作: 塗りつぶし
 */
export class CanvasActionFill extends CanvasAction {
  private _layer: Layer;
  private readonly _color: Color.Immutable;

  constructor(canvas: TegakiCanvas, layer: Layer, color: Color.Immutable) {
    super(canvas);
    this._layer = layer;
    this._color = color.copy();
  }

  exec() {
    const layer = this._layer;
    layer.context.fillStyle = this._color.css();
    layer.context.fillRect(0, 0, layer.width, layer.height);
    layer.notify("update");
  }
}

/**
 * 操作: 消去
 */
export class CanvasActionClear extends CanvasAction {
  private _layer: Layer;

  constructor(canvas: TegakiCanvas, layer: Layer) {
    super(canvas);
    this._layer = layer;
  }

  exec() {
    this._layer.clear();
    this._layer.notify("update");
  }
}

export function drawPath(ctx: CanvasRenderingContext2D, blush: BlushState, path: BlushPath, innerScale = 1) {
  if (path.length == 0) {
    return;
  }
  
  ctx.save();

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = blush.color.css();
  ctx.globalCompositeOperation = blush.composite;
  ctx.lineWidth = blush.size;

  ctx.beginPath();
  const fisrtPoint = path[0];
  ctx.moveTo(fisrtPoint.x, fisrtPoint.y);
  if (path.length == 1) {
    ctx.lineTo(fisrtPoint.x, fisrtPoint.y);
  }
  else {
    for (let i = 1; i < path.length; i++) {
      const point = path[i]
      ctx.lineTo(point.x, point.y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * 描画パスの包含矩形を取得
 * @param path 
 * @param size ブラシサイズ
 * @param padding 矩形に余裕を持たせる場合に指定
 * @returns 
 */
export function getPathBoundingRect(path: BlushPath, size: number, padding: number = 0): Rect {
  if (path.length == 0) {
    return new Rect(0, 0, 0, 0);
  }
  const firstPoint = path[0];
  let minX = firstPoint.x;
  let maxX = firstPoint.x;
  let minY = firstPoint.y;
  let maxY = firstPoint.y;

  for (let i = 1; i < path.length; i++) {
    const point = path[i];
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const r = size / 2;
  minX = (minX - r - padding) | 0;
  maxX = Math.ceil(maxX + r + padding);
  minY = (minY - r - padding) | 0;
  maxY = Math.ceil(maxY + r + padding);

  return new Rect(minX, minY, maxX - minX, maxY - minY);
}

export default CanvasAction;




