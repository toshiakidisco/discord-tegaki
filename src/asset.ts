import { isRunnningOnExtension } from "./funcs";
// @ts-ignore
import { assets } from "./assets";

/**
 * アセットの base64 URI 文字列の取得.
 * 指定した名前のアセットが存在しない場合は空文字列を返す.
 */
export function getAssetUrl(name: string): string {
  return ((assets as unknown) as {[name: string]: string})[name] || "";
}
