import { DiscordTegaki } from "./app";

// 特定 URL 下でのみ実行
const targetSites = [
  "https://discord.com/app",
  "https://discord.com/channels",
  "https://mebuki.moe/app/",
];

let shouldLaunch = false;
for (let site of targetSites) {
  if (location.href.startsWith(site)) {
    shouldLaunch = true;
    break;
  }
}

if (shouldLaunch) {
  DiscordTegaki.launch();
  console.log("[Discord Tegaki]Launched");
}
