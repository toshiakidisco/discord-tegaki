import { Outlets, adjustPosition, parseHtml } from "../dom";
import { clamp } from "../funcs";
import { ObservableValue } from "../foudantion/observable-value";
import Panel from "./panel";
import Subject from "../foudantion/subject";
import TegakiCanvas from "../tegaki-canvas";

type BindMode = "readwrite" | "read";

type SizePreset = {width: number, height: number};

const PREVIEW_BOX_SIZE = 80;

const SIZE_PRESETS = [
  {width: 344, height: 135},
  {width: 400, height: 400},
  {width: 135, height: 344},
]

function getFitSize(containerWidth: number, containerHeight: number, itemWidth: number, itemHeight: number) {
  const sx = containerWidth/itemWidth;
  const sy = containerHeight/itemHeight;
  const s = Math.min(sx, sy);

  return {width: itemWidth*s, height: itemHeight*s};
}

export class PanelResize extends Panel {
  readonly contents: HTMLElement;
  readonly canvas: TegakiCanvas;
  #outlets: Outlets;

  constructor(root: HTMLElement, canvas: TegakiCanvas) {
    super(root, "dt_r_panel-resize");
    this.#outlets = {};
    this.contents = parseHtml(`
      <div>
        <section class="dt_r_area_input">
          <div class="dt_r_row">
            <label>横:</label><input type="number" name="input-width">
          </div>
          <div class="dt_r_row">
            <label>縦:</label><input type="number" name="input-height">
          </div>
        </section>
        <section class="dt_r_area_presets" name="list-presets">
        </section>
      </div>
    `, this, this.#outlets);
    this.setContents(this.contents);

    this.canvas = canvas;

    this.hasTitleBar = false;
    this.hasCloseButton = false;
    this.autoClose = true;

    this.renderPresets(SIZE_PRESETS);
  }

  renderPreset(preset: SizePreset) {
    const outlets: Outlets = {};
    const element = parseHtml(`
      <div class="dt_r_preset">
        <div class="dt_r_size_preview">
          <div class="dt_r_box" name="box"></div>
        </div>
        <div class="dt_r_width">${preset.width}</div>
        <div class="dt_r_height">${preset.height}</div>
      </div>
    `, this, outlets);
    const previewBoxSize = getFitSize(PREVIEW_BOX_SIZE, PREVIEW_BOX_SIZE, preset.width, preset.height);
    outlets["box"].style.width = `${previewBoxSize.width}px`;
    outlets["box"].style.height = `${previewBoxSize.height}px`;

    this.#outlets["list-presets"].appendChild(element);
  }

  renderPresets(presets: SizePreset[]) {
    for (const preset of presets) {
      this.renderPreset(preset);
    }
  }
}

export default PanelResize;
