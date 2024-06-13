# ブラウザ拡張機能 DiscoTegaki

Discord上に、生まれたばかりの掲示板っぽく使えるお絵かき機能を追加します。
Google Chrome, Edgeで動作確認済み。

Chrome ウェブストア (v1.0.0)
https://chromewebstore.google.com/detail/discotegaki/eiaogpnffnhfkddeenblefkjbijlflhd

不具合修正・機能追加が発生した場合、ストアへの反映には時間がかかるため、先行してGitHubリポジトリのリリースに公開していきます。
 (野良アプリとしてのインストールになります。ご了承ください。)

## 使い方
インストールすると、Discordの画面の右下に「手書き」ボタンが表示されるので、クリックするとお絵かきできるウィンドウが表示されます。

自由にお絵かきしたあとは「コピー」ボタンでクリップボードにコピーができるので、そのまま投稿欄にペーストすることが可能です。

## ビルド
要 Node.js + npm
```
$ npm install
$ npm run build
```
