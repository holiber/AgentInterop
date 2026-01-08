import { module } from "../workbench-light.js";
import { chats } from "./chats.js";
import { providers } from "./providers.js";
import { shortcuts } from "./shortcuts.js";
import { tui } from "./tui.js";

export const root = module({
  chats,
  providers,
  shortcuts,
  tui
});

