
import { DiscordTegaki } from "./app";
import ApplicationSettings, { ApplicationSettingsInit } from "./settings";

async function launch() {
  const settings = await ApplicationSettings.load("tegaki-settings");
  const app = new DiscordTegaki(settings);
  /*
  if (! isRunnningOnExtension) {
    app.open(0, 0);
  }
  */
  return app;
}


// 特定 URL 下でのみ実行
const targetSites = [
  "https://discord.com/app",
  "https://discord.com/channels",
  "https://mebuki.moe/app",
];

let shouldLaunch = false;
if (! shouldLaunch) {
  for (let site of targetSites) {
    if (location.href.startsWith(site)) {
      shouldLaunch = true;
      break;
    }
  }
}

if (shouldLaunch) {
  launch();

  console.log("[Discord Tegaki]Launched");
}
