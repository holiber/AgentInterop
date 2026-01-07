import { z } from "zod";

import type { ChatsApiContext } from "../apis/chats-api.js";
import { runTui } from "../cli/tui.js";
import type { WorkbenchContext } from "../workbench-light.js";
import { module, mutate } from "../workbench-light.js";

export type TuiModuleContext = WorkbenchContext & ChatsApiContext;

export const tui = module((ctx: TuiModuleContext) => {
  return {
    api: {
      start: mutate(
        z
          .object({
            mode: z.enum(["simple", "advanced"]).optional(),
            providerId: z.string().optional(),
            chatId: z.string().optional()
          })
          .optional(),
        z.literal("ok"),
        async (input) => {
          return await runTui(ctx, { mode: input?.mode, providerId: input?.providerId, chatId: input?.chatId });
        },
        {
          id: "tui",
          pattern: "unary",
          args: [
            { name: "mode", type: "string", required: false, cli: { flag: "--mode" } },
            { name: "providerId", type: "string", required: false, cli: { flag: "--provider" } },
            { name: "chatId", type: "string", required: false, cli: { flag: "--chat" } }
          ]
        }
      )
    }
  };
});

