import Offscreen from "./canvas-offscreen";
import Color from "./foudantion/color";
import ObjectPool from "./foudantion/object-pool";
import { Rect } from "./foudantion/rect";
import TegakiCanvas, { BucketOption } from "./tegaki-canvas";
import { Layer } from "./canvas-layer";
import TegakiCanvasDocument from "./canvas-document";
import CanvasRegion from "./canvas-region";

export type BlushPath = {x: number; y: number; time: number}[];

export class BlushState {
  size: number;
  readonly color: Color;
  composite: GlobalCompositeOperation;

  constructor(size: number, color: Color.Immutable, composite: GlobalCompositeOperation) {
    this.size = size;
    this.color = color.copy();
    this.composite = composite;
  }

  eqauls(blush: BlushState): boolean {
    return this.size == blush.size && this.color.equals(blush.color) && this.composite == blush.composite;
  }
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

export namespace CanvasAction {
  /**
   * 操作: Null
   */
  export class None extends CanvasAction {
    exec(): void {};
  }

  /**
   * 操作: ドキュメント変更
   */
  export class Merge extends CanvasAction {
    #actions: CanvasAction[];
    constructor (act0: CanvasAction, ...actions: CanvasAction[]){
      super(act0.canvas);
      this.#actions = [act0].concat(actions);
    }
    
    exec(): void {
      for (const action of this.#actions) {
        action.exec();
      }
    };

    add(action: CanvasAction) {
      this.#actions.push(action);
    }

    unshift(action: CanvasAction) {
      this.#actions.unshift(action);
    }

    get first(): CanvasAction {
      return this.#actions[0];
    }

    get last(): CanvasAction {
      return this.#actions[this.#actions.length - 1];
    }

    dispose(): void {
      for (const action of this.#actions) {
        action.dispose();
      }
    }
  }

  /**
   * 操作: ドキュメント変更
   */
  export class ChangeDocument extends CanvasAction {
    #document: TegakiCanvasDocument;
    constructor (canvas: TegakiCanvas, doc: TegakiCanvasDocument){
      super(canvas);
      this.#document = doc;
    }
    
    exec(): void {
      this.canvas.document = this.#document;
    };
  }

  /**
   * 操作: 背景色変更
   */
  export class ChangeBackgroundColor extends CanvasAction {
    #color: Color;
    constructor (canvas: TegakiCanvas, color: Color.Immutable){
      super(canvas);
      this.#color = color.copy();
    }
    
    exec(): void {
      this.canvas.backgroundColor = this.#color;
    };
    
    get color(): Color.Immutable {
      return this.#color;
    }
  }

  /**
   * 操作: レイヤー追加
   */
  export class AddLayer extends CanvasAction {
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
  export class DeleteLayer extends CanvasAction {
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
  export class MoveLayer extends CanvasAction {
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
   * 操作: レイヤー透明度変更
   */
  export class ChangeLayerOpacity extends CanvasAction {
    readonly layer: Layer;
    readonly opacity: number;

    constructor (canvas: TegakiCanvas, layer: Layer, opacity: number){
      super(canvas);
      this.layer = layer;
      this.opacity = opacity;
    }
    
    exec(): void {
      this.layer.opacity = this.opacity;
    }
  }

  /**
   * 操作: 新規選択範囲
   */
  export class SelectNew extends CanvasAction {
    #region: CanvasRegion | null;
    constructor (canvas: TegakiCanvas, region: CanvasRegion | null){
      super(canvas);
      this.#region = region;
    }
    
    exec(): void {
      this.canvas.selectedRegion = this.#region;
    };
  }

  export class GrabState {
    // 掴み対象レイヤー
    readonly layer: Layer;
    // 掴み開始時のレイヤー画像
    readonly backupImage: Offscreen;
    // 掴み範囲の画像
    readonly image: Offscreen;
    // 掴み開始時の選択範囲座標
    startX: number;
    startY: number;
    // 掴みによる移動距離
    offsetX: number = 0;
    offsetY: number = 0;

    constructor(canvas: TegakiCanvas, layer: Layer) {
      if (canvas.selectedRegion == null) {
        throw new Error("Canvas has not selection");
      }
      this.layer = layer;
      this.backupImage = pool.get().set(layer);
      this.image = pool.get();
      canvas.putSelectedImageInto(this.image, layer);
      const rect = canvas.selectedRegion.boudingRect();
      this.startX = rect.x;
      this.startY = rect.y;
    }

    dispose() {
      pool.return(this.backupImage);
      pool.return(this.image);
    }
  }

  /**
   * 操作: 選択範囲掴み開始
   */
  export class SelectGrabStart extends CanvasAction {
    #grabState: GrabState;

    constructor (canvas: TegakiCanvas, grabState: GrabState){
      super(canvas);
      this.#grabState = grabState;
    }
    
    exec(): void {
      this.canvas.grabState = this.#grabState;
    }

    dispose(): void {
      this.#grabState.dispose();
    }
  }

  /**
   * 操作: 選択範囲掴みキャンセル
   */
  export class SelectGrabCancel extends CanvasAction {
    #grabState: GrabState;

    constructor (canvas: TegakiCanvas, grabState: GrabState){
      super(canvas);
      this.#grabState = grabState;
    }
    
    exec(): void {
      console.log("SelectGrabCancel exec");
      // 掴み状態を無効に
      this.canvas.grabState = null;
      // 対処レイヤーを元の状態に戻し
      const layer = this.#grabState.layer;
      layer.set(this.#grabState.backupImage);
      // 選択範囲も掴み開始位置に戻す
      const region = this.canvas.selectedRegion;
      if (region != null) {
        region.offsetX = 0;
        region.offsetY = 0;
      }
      layer.notify("update", layer);
    }
  }

  /**
   * 操作: 選択範囲のみ移動
   */
  export class SelectMove extends CanvasAction {
    #x: number;
    #y: number;
    constructor (canvas: TegakiCanvas, x: number, y: number){
      super(canvas);
      this.#x = x;
      this.#y = y;
    }

    get x() {
      return this.#x;
    }
    get y() {
      return this.#y;
    }

    exec(): void {
      const region = this.canvas.selectedRegion;
      if (region == null) {
        return;
      }
      region.offset(this.#x, this.#y);
    };
  }

  /**
   * 操作: 選択範囲を画像ごと移動
   */
  export class SelectMoveImage extends CanvasAction {
    #offsetX: number;
    #offsetY: number;
    #layer: Layer;
    constructor (canvas: TegakiCanvas, layer: Layer, offsetX: number, offsetY: number){
      super(canvas);
      this.#layer = layer;
      this.#offsetX = offsetX;
      this.#offsetY = offsetY;
    }
    
    exec(): void {
      const region = this.canvas.selectedRegion;
      if (region == null) {
        return;
      }
      const img = pool.get();
      const rect = this.canvas.putSelectedImageInto(img, this.#layer);
      if (typeof rect === "undefined") {
        pool.return(img);
        return;
      }
      const layer = this.#layer;
      layer.context.clearRect(rect.x, rect.y, rect.width, rect.height);
      layer.context.drawImage(img.canvas, rect.x + this.#offsetX, rect.y + this.#offsetY);
      pool.return(img);
      region.offset(this.#offsetX, this.#offsetY);
      layer.notify("update", layer);
    };
  }

  /**
   * 操作: 画像描画
   */
  export class DrawImage extends CanvasAction {
    private _layer: Layer;
    private _image: Offscreen;
    private _rect: Rect;
    private _copy: boolean;

    constructor(
      canvas: TegakiCanvas, layer: Layer,
      image: Offscreen, sx: number, sy: number, sw: number, sh: number,
      dx: number, dy: number,
      copy: boolean = true
    ) {
      super(canvas);
      this._layer = layer;
      this._image = pool.get();
      this._image.width = sw;
      this._image.height = sh;
      this._image.context.drawImage(image.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      this._rect = new Rect(dx, dy, sw, sh);
      this._copy = copy;
    }

    get rect(): Rect.Immutable {
      return this._rect;
    }

    exec(): void {
      const ctx = this._layer.context;
      if (this._copy) {
        ctx.clearRect(this._rect.x, this._rect.y, this._rect.width, this._rect.height);
      }
      ctx.drawImage(this._image.canvas, this._rect.x, this._rect.y);
      this._layer.notify("update", this._layer);
    }

    dispose(): void {
      pool.return(this._image);
    }
  }

  /**
   * 操作: キャンバスサイズ変更
   */
  export class Resize extends CanvasAction {
    private _width: number;
    private _height: number;

    constructor(
      canvas: TegakiCanvas, width: number, height: number,
    ) {
      super(canvas);
      this._width = width;
      this._height = height;
    }

    exec(): void {
      const image = pool.get();
      for (let layer of this.canvas.layers) {
        image.set(layer);
        layer.width = this._width*this.canvas.innerScale;
        layer.height = this._height*this.canvas.innerScale;
        layer.clear();
        layer.context.drawImage(image.canvas, 0, 0);
        layer.notify("update", layer);
      }
      pool.return(image);

      this.canvas.setSize(this._width, this._height);
      this.canvas.updateCanvasSize();
    }
  }

  /**
   * 操作: ブラシ描画
   */
  export class DrawPath extends CanvasAction {
    private _layer: Layer;
    private _blush: BlushState;
    private _pathList: BlushPath[];

    constructor(canvas: TegakiCanvas, layer: Layer, blush: BlushState, path: BlushPath) {
      super(canvas);
      this._layer = layer;
      this._blush = blush;
      this._pathList = [Array.from(path)];    
    }

    get pathList() {
      return this._pathList;
    }

    addPath(path: BlushPath) {
      this._pathList.push(Array.from(path));
    }

    addPathList(pathList: BlushPath[]) {
      this._pathList.push(...pathList);
    }

    get startTime() {
      return this._pathList[0][0].time;
    }

    get finishTime() {
      const lastPath = this._pathList[this._pathList.length - 1];
      return lastPath[lastPath.length - 1].time;
    }

    get layer(): Layer {
      return this._layer;
    }

    get blush(): BlushState {
      return this._blush;
    }

    exec() {
      const ctx = this._layer.context;
      this.canvas.clipBegin(ctx);
      for (const path of this._pathList) {
        drawPath(ctx, this._blush, path, this.canvas.innerScale);
      }
      this.canvas.clipEnd(ctx);
      this._layer.notify("update", this._layer);
    }
  }

  /**
   * 操作: リサイズ取り消し
   */
  export class UndoResize extends CanvasAction {
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
        layer.notify("update", layer);
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
  export class Flip extends CanvasAction {
    exec() {
      const image = pool.get();
      for (const layer of this.canvas.layers) {
        image.set(layer);
        layer.clear();
        layer.context.save();
        layer.context.scale(-1, 1);
        layer.context.drawImage(image.canvas, - layer.width, 0);
        layer.context.restore();
        layer.notify("update", layer);
      }
      pool.return(image);
    }
  }

  /**
   * 操作: 塗りつぶし
   */
  export class Fill extends CanvasAction {
    private _layer: Layer;
    private readonly _color: Color.Immutable;

    constructor(canvas: TegakiCanvas, layer: Layer, color: Color.Immutable) {
      super(canvas);
      this._layer = layer;
      this._color = color.copy();
    }

    exec() {
      const layer = this._layer;
      const ctx = layer.context;
      this.canvas.clipBegin(ctx);
      ctx.fillStyle = this._color.css();
      ctx.fillRect(0, 0, layer.width, layer.height);
      this.canvas.clipBegin(ctx);
      layer.notify("update", layer);
    }
  }

  /**
   * 操作: 消去
   */
  export class Clear extends CanvasAction {
    private _layer: Layer;

    constructor(canvas: TegakiCanvas, layer: Layer) {
      super(canvas);
      this._layer = layer;
    }

    exec() {
      this.canvas.clipBegin(this._layer.context);
      this._layer.clear();
      this.canvas.clipEnd(this._layer.context);
      this._layer.notify("update", this._layer);
    }
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




