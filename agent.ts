import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { getModel } from "@earendil-works/pi-ai";
import { join } from "path";
import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";

const rl = createInterface({ input: stdin, output: stdout });
const textFormat = {
  toolCall: (s: string) => `\x1b[1;90m${s}\x1b[0m`, // bold grey
  done: (s: string) => `\x1b[1;32m${s}\x1b[0m`, // bold green
  error: (s: string) => `\x1b[1;31m${s}\x1b[0m`, // bold red
};

const cwd = process.cwd();
const agentDir = join(cwd, ".pi-agent");

const baseLoader = new DefaultResourceLoader({
  cwd,
  agentDir,
  systemPromptOverride: () =>
    `You're a helpful assitant helping to discuss stuff about this PC. Speak as a pirate, always end responses with "Arrrr!"`,
  appendSystemPromptOverride: () => [],
});
await baseLoader.reload();

const model = getModel(
  "amazon-bedrock",
  "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
);
const { session } = await createAgentSession({
  model,
  resourceLoader: baseLoader,
  sessionManager: SessionManager.inMemory(),
});

try {
  session.subscribe((event) => {
    switch (event.type) {
      case "message_update": {
        if (event.assistantMessageEvent.type === "text_delta") {
          process.stdout.write(event.assistantMessageEvent.delta);
        }
        return;
      }

      case "tool_execution_start": {
        const { toolName, args } = event;
        process.stdout.write(
          textFormat.toolCall(`\n→ ${toolName}(${JSON.stringify(args)})\n`),
        );
        return;
      }

      case "tool_execution_end": {
        process.stdout.write(
          event.isError
            ? textFormat.error("  ✗ error\n\n")
            : textFormat.done("  ✓ done\n\n"),
        );
        return;
      }
    }
  });

  while (true) {
    const userInput = (await rl.question("\n> ")).trim();
    if (!userInput || userInput === "exit") break;
    await session.prompt(userInput);
  }
  session.state.messages.forEach((msg) => {
    console.log(msg);
  });
  console.log();
} finally {
  rl.close();
  session.dispose();
}
