import ApplicationSettings from "../settings";
import PanelProperties, { PanelPropertiesItem, PanelPropertiesItemNumber } from "./properties";

export class PanelSettings extends PanelProperties{
  constructor(root: HTMLElement, settings: ApplicationSettings) {
    super(root);

    this.addItem(
      new PanelPropertiesItemNumber("取り消し回数", 20, 1, 100).bind(settings.observables.undoMax)
    );
    this.addItem(
      new PanelPropertiesItemNumber("ブラシ操作をまとめる時間", 0, 0, 500).bind(settings.observables.strokeMergeTime)
    );
    
  }
}

export default PanelSettings;
