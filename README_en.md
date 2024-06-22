# Browser Extension: DiscoTegaki

This extension adds a small canvas to Discord.

## Build

npm (v10.8.0 or higher) required

```
$ npm install
$ npm run build
```

Extension files will be created in ./dist.

## Usage
Once installed, a "手書き" button will appear in the bottom right of the Discord screen. Clicking it will open a window where you can draw.

After drawing as you like, you can use the "コピー" button to copy it to your clipboard, so you can paste it into your post.

### Shorcuts
- Ctrl + Z: Undo
- Ctrl + Y: Redo
- Ctrl + C: Copy
- N: Pencil
- E: Eraser
- Alt: Eyedropper

## Release Note
v1.1.0
- Added color palette
- Added eyedropper tool
- Improved cursor experience
  - Displayed as white in dark areas and black in bright areas
  - Displayed as a circle when the brush size is large
- Independent pencil and eraser sizes
- Added shortcuts Alt: Eyedropper, Ctrl + C: Copy to clipboard
- When you hold down the pencil (N) or eraser (E) shortcut, the tool will only switch while you are holding it down.
- If you cannot undo or redo, the icon will be displayed in gray
- Other minor fixes

v1.0.1
- Added timestamp to file name when copying to clipboard.
- Added ability to move window by dragging title.
- Added ability to change canvas size by dragging bottom right.
- Added icons: New canvas, Save, Flip horizontally, Undo, Redo.
- Added shortcuts N: Pencil tool, E: Eraser tool.
- Fixed issue where the image was displayed on Discord homepage, etc.
- Fixed issue where the image was zoomed in too much and went off screen.
- Other minor fixes.