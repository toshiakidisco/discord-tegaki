export namespace shortcut {
  export type ShortcutMode = "Instant" | "Temporary" | "PressTemp";

  export type Shortcut = {
    name: string,
    key: string,
    ctrl?: boolean, // default false
    shift?: boolean, // default false
    alt?: boolean, // default false
    press?: boolean, // default true
    mode?: ShortcutMode, // default "Instant"
  };

  export function match(ev: KeyboardEvent): Shortcut | null {
    for (let sc of shortcuts) {
      if (sc.key != ev.key) {
        continue;
      }
      if ((sc.ctrl === true || sc.key == "Control") != ev.ctrlKey) {
        continue;
      }
      if ((sc.alt === true || sc.key == "Alt") != ev.altKey) {
        continue;
      }
      if ((sc.shift === true || sc.key == "Shift") != ev.shiftKey) {
        continue;
      }
      if ((ev.repeat) && (sc.press === false)) {
        continue;
      }
      return sc;
    }
    return null;
  }

  export const shortcuts: Shortcut[] = [
    {name: "undo", ctrl: true, key: "z"},
    {name: "redo", ctrl: true, key: "y"},
    {name: "copy", ctrl: true, key: "c", press: false},

    {name: "select-all", ctrl: true, key: "a", press: false},
    {name: "deselect", ctrl: true, key: "d", press: false},
    {name: "delete", key: "Backspace", press: false},
    
    {name: "size-change", ctrl: true, key: "Alt"},

    {name: "spoit", key: "Alt", mode: "Temporary", press: false},
    {name: "pencil", key: "n", mode: "PressTemp", press: false},
    {name: "eraser", key: "e", mode: "PressTemp", press: false},
    {name: "select", key: "m", mode: "PressTemp", press: false},
    {name: "bucket", key: "g", mode: "PressTemp", press: false},

    {name: "grab-up"   , ctrl: true, key: "ArrowUp"},
    {name: "grab-down" , ctrl: true, key: "ArrowDown"},
    {name: "grab-left" , ctrl: true, key: "ArrowLeft"},
    {name: "grab-right", ctrl: true, key: "ArrowRight"},
    
    {name: "move-up"   , key: "ArrowUp"},
    {name: "move-down" , key: "ArrowDown"},
    {name: "move-left" , key: "ArrowLeft"},
    {name: "move-right", key: "ArrowRight"},
    
    {name: "move-fast-up"   , shift: true, key: "ArrowUp"},
    {name: "move-fast-down" , shift: true, key: "ArrowDown"},
    {name: "move-fast-left" , shift: true, key: "ArrowLeft"},
    {name: "move-fast-right", shift: true, key: "ArrowRight"},
  ]
}

export default shortcut;
