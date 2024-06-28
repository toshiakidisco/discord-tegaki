import CanvasTool from "./canvas-tool";
import PanelProperties, { PanelPropertiesItem, PanelPropertiesItemNumber } from "./panel-properties";

export class PanelBucket extends PanelProperties{
  constructor(root: HTMLElement, tool: CanvasTool.Bucket) {
    super(root);

    this.addItem(
      new PanelPropertiesItemNumber("隙間閉じ", 0, 0, 20).bind(tool.obaservables.closeGap)
    );
    this.addItem(
      new PanelPropertiesItemNumber("色の誤差", 0, 0, 20).bind(tool.obaservables.tolerance)
    );
    this.addItem(
      new PanelPropertiesItemNumber("領域拡大", 0, 0, 10).bind(tool.obaservables.expand)
    );
    
  }
}

export default PanelBucket;
