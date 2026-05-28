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
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      process.stdout.write(event.assistantMessageEvent.delta);
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
