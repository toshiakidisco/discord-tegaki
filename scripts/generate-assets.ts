/*
 * /src/assets.ts の生成
 * /src/asset 内のファイルをスキャンし、
 * ファイル名をキーに、その base64URL　エンコードされたデータを取得できる
 * オブジェクトを作成する
 */

import fs from "fs";
import path from "path";

// === 設定 ===
const assetDir = path.resolve(__dirname, "../src/asset");
const outputFile = path.resolve(__dirname, "../src/assets.ts");

// === ファイルスキャン ===
const files = fs.readdirSync(assetDir);

const assets: Record<string, string> = {};

for (const file of files) {
  const filePath = path.join(assetDir, file);
  if (fs.statSync(filePath).isFile()) {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(file).toLowerCase().replace(".", "");
    const mime =
      {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        svg: "image/svg+xml",
        mp3: "audio/mpeg",
        wav: "audio/wav",
        mp4: "video/mp4",
        txt: "text/plain",
      }[ext] || "application/octet-stream";

    const base64 = buffer.toString("base64");
    const dataUrl = `data:${mime};base64,${base64}`;
    assets[file] = dataUrl;
  }
}

// === TypeScriptファイル出力 ===
const content = `
  type Assets = {[name: string]: string};
  export const assets: Assets = ${JSON.stringify(assets, null, 2)};
`;

fs.writeFileSync(outputFile, content);

console.log(`✅ Assets file generated at: ${outputFile}`);