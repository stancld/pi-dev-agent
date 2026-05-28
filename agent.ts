import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { getModel } from "@earendil-works/pi-ai";
import { join } from "path";

const cwd = process.cwd();
const agentDir = join(cwd, ".pi-agent");

const baseLoader = new DefaultResourceLoader({
  cwd,
  agentDir,
  systemPromptOverride: () =>
    `You're a helpful assitant helping to explore your Rossum organization. Speak as a pirate, always end responses with "Arrrr!"`,
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

  await session.prompt(
    "What is the current state of Intelligent Document Processing space?",
  );
  session.state.messages.forEach((msg) => {
    console.log(msg);
  });
  console.log();
} finally {
  session.dispose();
}
