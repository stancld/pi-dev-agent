import { createAgentSession } from "@earendil-works/pi-coding-agent";
import { getModel } from "@earendil-works/pi-ai";


const model= getModel("amazon-bedrock", "eu.anthropic.claude-haiku-4-5-20251001-v1:0");
const { session } = await createAgentSession({ model });

try {
    session.subscribe((event) => {
        if (event.type === "message_update" && event.assistantMessageEvent.type == "text_delta") {
            process.stdout.write(event.assistantMessageEvent.delta);
        }
    });

    await session.prompt("What is the current state of Intelligent Document Processing space?");
    session.state.messages.forEach((msg) => {
        console.log(msg);
    });
    console.log();
} finally {
    session.dispose();
}