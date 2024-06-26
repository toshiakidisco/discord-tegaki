import Layer from "./canvas-layer";
import Offscreen from "./canvas-offscreen";
import { Outlets, parseHtml } from "./dom";
import Panel from "./panel"
import PanelSlider from "./panel-slider";
import Subject from "./subject";
import TegakiCanvas from "./tegaki-canvas";

const thumbnailWidth = 48;
const thumbnailHeight = 32;

const opacityIconColor = "48, 23, 23";

class PanelLayerItem extends Subject {
  readonly element: HTMLElement;
  #layer: Layer;
  #outlets: Outlets;
  #context: CanvasRenderingContext2D;
  #parent: PanelLayer;

  constructor(parent: PanelLayer, layer: Layer) {
    super();
    this.#parent = parent;
    this.#layer = layer;
    this.#outlets = {};
    this.element = parseHtml(`
      <li class="layer-item" data-on-click="onClick">
        <div name="visibility" class="block-visibility" data-on-click="onCliCKVisibility"></div>
        <div class="block-thumbnail">
        <canvas name="canvas" class="bg-transparent-s" width="${thumbnailWidth}" height="${thumbnailHeight}"></canvas>
        </div>
        <div class="block-opacity">
          <div class="icon-opacity bg-transparent-s" data-on-click="onClickOpacity"><div name="opacity-color" class="opacity-color"></div></div>
        </div>
      </li>
    `, this, this.#outlets);

    const canvas = this.#outlets["canvas"] as HTMLCanvasElement;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.#context = ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";

    layer.addObserver(this, "update", () => {
      if (this.#parent.visible) {
        this.requestRender();
      }
    });
    // Visibility Action
    const visibilityBlock = this.#outlets["visibility"];
    if (layer.isVisible) {
      visibilityBlock.setAttribute("data-visible", "");
    }
    layer.observables.isVisible.addObserver(this, "change", (isVisible) => {
      if (isVisible) {
        visibilityBlock.setAttribute("data-visible", "");
      }
      else {
        visibilityBlock.removeAttribute("data-visible");
      }
      this.#parent.canvas.requestRender();
    });
    layer.observables.opacity.addObserver(this, "change", (opacity) => {
      this.updateOpacityIcon();
    });
    this.updateOpacityIcon();

    this.requestRender();
  }

  get layer(): Layer {
    return this.#layer;
  }

  #renderCallback: FrameRequestCallback = this.render.bind(this);
  #needsRender = false;
  requestRender() {
    if (this.#needsRender) {
      return;
    }
    this.#needsRender = true;
    window.requestAnimationFrame(this.#renderCallback);
  }

  render() {
    this.#needsRender = false;

    const ctx = this.#context;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const layer = this.#layer
    const drawSize = getFitSize(thumbnailWidth, thumbnailHeight, layer.width, layer.height);
    ctx.canvas.width = drawSize.width;
    ctx.canvas.height = drawSize.height;
    ctx.clearRect(0, 0, thumbnailWidth, thumbnailHeight);
    ctx.drawImage(
      layer.canvas,
      0, 0, layer.width, layer.height,
      0, 0, drawSize.width, drawSize.height
    );
  }

  updateOpacityIcon() {
    const icon = this.#outlets["opacity-color"];
    icon.style.backgroundColor = `rgba(${opacityIconColor}, ${this.#layer.opacity})`;
  }

  onClick(ev: MouseEvent) {
    this.#parent.canvas.selectLayer(this.#layer);
  }
  
  onCliCKVisibility(ev: MouseEvent) {
    ev.stopPropagation();
    this.#layer.isVisible = !this.#layer.isVisible;
  }

  onClickOpacity(ev: MouseEvent) {
    ev.stopPropagation();
    const slider = this.#parent.opacitySlider;
    
    slider.close();
    slider.bind(this.#layer.observables.opacity, "read");
    slider.addObserver(this, "change", (value: number) => {
      this.#parent.canvas.changeLayerOpacity(this.#layer, value);
    });
    slider.addObserver(this, "close", () => {
      slider.removeObserver(this);
    });
    slider.open(ev.clientX, ev.clientY);
  }

  dispose() {
    this.#layer.removeObserver(this);
  }
}

export class PanelLayer extends Panel {
  #outlets: Outlets = {};
  #items: PanelLayerItem[] = [];
  #contents: HTMLElement;
  #canvas: TegakiCanvas;

  readonly opacitySlider: PanelSlider;

  constructor(parent: HTMLElement, canvas: TegakiCanvas) {
    super(parent, "panel-layer");
    this.opacitySlider = new PanelSlider(parent, 0);
    this.opacitySlider.setRange(0, 1);
    this.opacitySlider.step = 0.01;
    this.opacitySlider.scale = 100;
    this.opacitySlider.addObserver(this, "change", () => {
      this.#canvas.requestRender();
    });

    this.#contents = parseHtml(`
      <div name="contents">
        <div class="area-buttons">
          <button name="button-new" data-on-click="onClickNew"><img src="[asset/icon-layer-new.png]"></button>
          <button name="button-up" data-on-click="onClickUp"><img src="[asset/icon-layer-up.png]"></button>
          <button name="button-down" data-on-click="onClickDown"><img src="[asset/icon-layer-down.png]"></button>
          <div class="space"></div>
          <button name="button-delete" data-on-click="onClickDelete"><img src="[asset/icon-layer-delete.png]"></button>
        </div>
        <div class="area-layers">
          <ul name="layers" class="layers">
          </ul>
        </div>
      </div>
    `, this, this.#outlets);

    this.setContents(this.#contents);
    this.title = "レイヤー";

    this.#canvas = canvas;
    this.bindCanvas(canvas);
  }

  get canvas(): TegakiCanvas {
    return this.#canvas;
  }

  bindCanvas(canvas: TegakiCanvas) {
    this.#canvas = canvas;
    this.#items.length = 0;
    const currentLayer = canvas.currentLayer;
    const layersElem = this.#outlets["layers"];
    for (let layer of canvas.layers) {
      const item = new PanelLayerItem(this, layer);
      this.#items.push(item);
      if (layer == currentLayer) {
        item.element.setAttribute("data-active", "");
      }
      layersElem.appendChild(item.element);
    }

    canvas.addObserver(this, "add-layer", (ev: {layer: Layer; position: number;}) => {
      const item = new PanelLayerItem(this, ev.layer);
      this.#items.splice(ev.position, 0, item);
      const child = layersElem.children[ev.position];
      layersElem.insertBefore(item.element, child || null);
    });

    canvas.addObserver(this, "delete-layer", (ev: {layer: Layer; position: number;}) => {
      const layersElem = this.#outlets["layers"];
      for (let item of this.#items) {
        if (item.layer == ev.layer) {
          item.element.parentElement?.removeChild(item.element);
        }
      }
      this.#items.splice(ev.position, 1);
    });

    canvas.addObserver(this, "move-layer", (ev: {layer: Layer; from: number; to: number;}) => {
      const layersElem = this.#outlets["layers"];
      const item = this.#items[ev.from];
      this.#items.splice(ev.from, 1);
      const dstItem = this.#items[ev.to];
      this.#items.splice(ev.to, 0, item);

      layersElem.insertBefore(item.element, dstItem ? dstItem.element : null);
    });

    canvas.addObserver(this, "change-current-layer", (ev: {layer: Layer; position: number;}) => {
      for (let item of this.#items) {
        if (item.layer == ev.layer) {
          item.element.setAttribute("data-active", "");
        }
        else {
          item.element.removeAttribute("data-active");
        }
      }
    });

    canvas.addObserver(this, "change-document", (doc) => {
      const layersElem = this.#outlets["layers"];
      layersElem.innerHTML = "";
      this.#items.length = 0;

      for (let layer of doc.layers) {
        const item = new PanelLayerItem(this, layer);
        this.#items.push(item);
        if (layer == currentLayer) {
          item.element.setAttribute("data-active", "");
        }
        layersElem.appendChild(item.element);
      }
    });
  }

  override open(x: number, y: number): void {
    super.open(x, y);
    for (let item of this.#items) {
      item.requestRender();
    }
  }

  onClickNew(ev: MouseEvent) {
    this.#canvas.newLayer(this.#canvas.currentLayerPosition + 1);
  }

  onClickDelete(ev: MouseEvent) {
    this.#canvas.deleteLayer(this.#canvas.currentLayer);
  }

  onClickUp(ev: MouseEvent) {
    this.#canvas.moveLayerRelatively(this.#canvas.currentLayer, 1);
  }

  onClickDown(ev: MouseEvent) {
    this.#canvas.moveLayerRelatively(this.#canvas.currentLayer, -1);
  }

}

function getFitSize(pw: number, ph: number, cw: number, ch: number) {
  let width: number, height: number;
  if (cw/ch > pw/ph) {
    width = pw;
    height = Math.ceil(ch * pw/cw);
  }
  else {
    width = Math.ceil(cw * ph/ch);
    height = ph;
  }
  return {width, height};
}


export default PanelLayer;
