import { DiscordTegaki } from "./app";

declare global {
  interface Window {
    DiscoTegaki: typeof DiscordTegaki;
  }
}

window["DiscoTegaki"] = DiscordTegaki;
