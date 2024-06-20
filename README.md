# ブラウザ拡張機能 DiscoTegaki

Discord上に、生まれたばかりの掲示板っぽく使えるお絵かき機能を追加します。
Google Chrome, Edgeで動作確認済み。

Chrome ウェブストア (v1.0.1)
https://chromewebstore.google.com/detail/discotegaki/eiaogpnffnhfkddeenblefkjbijlflhd

不具合修正・機能追加が発生した場合、ストアへの反映には時間がかかるため、先行してGitHubリポジトリのリリースに公開していきます。
 (野良アプリとしてのインストールになります。ご了承ください。)

## 使い方
インストールすると、Discordの画面の右下に「手書き」ボタンが表示されるので、クリックするとお絵かきできるウィンドウが表示されます。

自由にお絵かきしたあとは「コピー」ボタンでクリップボードにコピーができるので、そのまま投稿欄にペーストすることが可能です。

### ショートカット
- Ctrl + Z: 取り消し
- Ctrl + Y: やり直し
- Ctrl + C: クリップボードにコピー
- N: 鉛筆ツール (長押しで一時切替)
- E: 消しゴムツール (長押しで一時切替)
- Alt: スポイトツール (一時切替)


## ビルド
要 Node.js + npm
```
$ npm install
$ npm run build
```

## リリースノート
v1.1.0
- カラーパレットの追加
- スポイト機能の追加
- カーソルのエクスペリエンスの改善
  - 暗い所では白 明るいところでは黒で表示
  - ブラシサイズが大きい場合 それに合わせた円形で表示
- 鉛筆と消しゴムのサイズの独立
- ショートカットの追加 Alt:スポイト Ctrl + C:クリップボードコピー
- 鉛筆(N) 消しゴム(E)のショートカットを長押しした場合、押している間だけツールが切り替わるように。
- 取り消し・やり直しができない場合はアイコンをグレーに表示
- 他、細かい修正

v1.0.1
- クリップボードコピー時のファイル名にタイムスタンプを付与。
- タイトル部分をドラッグでウィンドウを移動できるように。
- 右下部分をドラッグでキャンバスサイズを変えられるように
- ツールの追加: 新規キャンバス, 保存, 左右反転, 取り消し, やり直し
- ショートカットの追加 N: 鉛筆ツール, E: 消しゴムツール
- Discordトップページなどにも表示されてしまっていたのを修正
- 拡大しすぎて画面外にいってしまうのを修正
- 他、細かい修正
