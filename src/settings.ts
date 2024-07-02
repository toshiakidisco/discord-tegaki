import { JsonStructure, parse } from "./foudantion/json";
import { ObservableValue } from "./foudantion/observable-value";
import Subject from "./foudantion/subject";
import storage from "./storage";

export type ApplicationSettingsInit = {
  undoMax: number;
  strokeMergeTime: number;
};

type Observalbles = {[key: string]: ObservableValue<any>};

export class ApplicationSettings extends Subject {
  readonly observables: {
    readonly undoMax: ObservableValue<number>,
    readonly strokeMergeTime: ObservableValue<number>,
  };

  constructor(init: ApplicationSettingsInit) {
    super();
    this.observables = {
      undoMax: new ObservableValue(init.undoMax),
      strokeMergeTime: new ObservableValue(init.strokeMergeTime),
    };

    for (const key in this.observables) {
      const obaservable = (this.observables as Observalbles)[key];
      obaservable.addObserver(this, "change", value => {
        this.notify("change", this);
      });
    }
  }

  get undoMax() {
    return this.observables.undoMax.value;
  }
  get strokeMergeTime() {
    return this.observables.strokeMergeTime.value;
  }

  serialize(): ApplicationSettingsInit {
    return {
      undoMax: this.undoMax,
      strokeMergeTime: this.strokeMergeTime,
    }
  }

  /**
   * 保存された環境設定の読み込み
   */
  static async load(path: string) {
    try {
      const stored = await storage.local.get(path) as ApplicationSettingsInit;
      if (stored == null) {
        return null;
      }
      parse(stored, ApplicationSettings.structure);
      return stored;
    }
    catch (err: any){
      console.warn("[Discord Tegaki]Failed to load settings");
      console.warn(err);
    }
    return null;
  }
}

export namespace ApplicationSettings {
  export const initialSettings: ApplicationSettingsInit = {
    "undoMax": 20,
    "strokeMergeTime": 150,
  };

  export type Serialized = {
    "undoMax": number,
    "strokeMergeTime": number,
  };

  export const structure: JsonStructure = {
    "undoMax": "number?|>0|<200|=20",
    "strokeMergeTime": "number?|>0|<500|=150",
  };
}

export default ApplicationSettings;
