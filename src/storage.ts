import { isRunnningOnExtension } from "./funcs";
import { JsonValue } from "./json";

export interface LocalStorage {
  set(key: string, data: JsonValue): Promise<void>;
  get(key: string): Promise<JsonValue | null>;
  remove(key: string): Promise<void>;
}

class ExtensionLocalStorage implements LocalStorage {
  set(key: string, data: JsonValue): Promise<void> {
    const obj: {[key: string]: JsonValue} = {};
    obj[key] = data;
    return chrome.storage.local.set(obj);
  }

  async get(key: string): Promise<JsonValue | null> {
    const values = await chrome.storage.local.get(key);
    if (typeof values[key] == "undefined") {
      return null;
    }
    return values[key];
  }

  remove(key: string): Promise<void> {
    return chrome.storage.local.remove(key);
  }
}

class BrowserLocalStorage implements LocalStorage {
  async set(key: string, data: JsonValue): Promise<void> {
    window.localStorage.setItem(key, JSON.stringify(data));
  }

  async get(key: string): Promise<JsonValue | null> {
    const value = window.localStorage.getItem(key);
    if (value == null) {
      return null;
    }
    try {
      return JSON.parse(value);
    }
    catch {
      return value;
    }
  }

  async remove(key: string): Promise<void> {
    window.localStorage.removeItem(key);
  }
}

export namespace storage {
  export const local: LocalStorage = chrome?.storage?.local ? new ExtensionLocalStorage() : new BrowserLocalStorage();
}

export default storage;
