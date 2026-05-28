#!/usr/bin/env node

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
  thinking: (s: string) => `\x1b[2;3;37m${s}\x1b[0m`, // dim italy grey
  toolCall: (s: string) => `\x1b[1;90m${s}\x1b[0m`, // bold grey
  done: (s: string) => `\x1b[1;32m${s}\x1b[0m`, // bold green
  error: (s: string) => `\x1b[1;31m${s}\x1b[0m`, // bold red
  usage: (s: string) => `\x1b[3;94m${s}\x1b[0m`, // italic orange
};

function extractText(partial: unknown): string | null {
  if (!partial || typeof partial !== "object") return null;
  if (!("content" in partial) || !Array.isArray(partial.content)) return null;
  const first: unknown = partial.content[0];
  if (!first || typeof first !== "object") return null;
  if (!("type" in first) || first.type !== "text") return null;
  if (!("text" in first) || typeof first.text !== "string") return null;
  return first.text;
}

const cwd = process.cwd();
const agentDir = join(cwd, ".pi-agent");

const baseLoader = new DefaultResourceLoader({
  cwd,
  agentDir,
  systemPromptOverride: () =>
    `You're a helpful assistant helping to discuss stuff Rossum AI. Speak as a pirate, always end responses with "Arrrr!"`,
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
        const messageUpdateEvent = event.assistantMessageEvent;
        switch (messageUpdateEvent.type) {
          case "thinking_start": {
            process.stdout.write(textFormat.thinking("\n💭 "));
            return;
          }
          case "thinking_delta": {
            process.stdout.write(textFormat.thinking(messageUpdateEvent.delta));
            return;
          }
          case "thinking_end": {
            process.stdout.write("\n\n");
            return;
          }
          case "text_delta": {
            process.stdout.write(messageUpdateEvent.delta);
            return;
          }
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

      case "tool_execution_update": {
        const text = extractText(event.partialResult);
        if (!text) return;
        const lastLine = text.trimEnd().split("\n").pop() ?? "";
        if (lastLine) {
          process.stdout.write(textFormat.toolCall(`  … ${lastLine}\n`));
        }
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

    const msgs = session.state.messages;
    const last = msgs[msgs.length - 1];
    if (last?.role === "assistant") {
      const u = last.usage;
      process.stdout.write(
        textFormat.usage(
          `\nIn: ${u.input} / Out: ${u.output} / Cached in: ${u.cacheRead}\n`,
        ),
      );
    }
  }
  session.state.messages.forEach((msg) => {
    console.log(msg);
  });
  console.log();
} finally {
  rl.close();
  session.dispose();
}
