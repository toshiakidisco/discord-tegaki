import { isRunnningOnExtension } from "./funcs";

let _assetDirectory = "";
/**
 * アセット参照先ディレクトリの設定
 */
export function setAssetDirectory(path: string) {
  if (! path.endsWith("/")) {
    path = path + "/";
  }
  _assetDirectory = path;
}

/**
 * アセットの完全URLの取得
 */
export function getAssetUrl(path: string) {
  return isRunnningOnExtension ? chrome.runtime.getURL(path) : _assetDirectory + path;
}
