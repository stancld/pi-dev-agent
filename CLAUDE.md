# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

Personal playground where the **user is learning TypeScript by hand**, using the pi dev SDK (`@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent`) as the vehicle. The goal is the user's learning, not a polished app.

This shapes how to help here:
- **Suggest, don't act.** Default mode: propose the change (describe it, or show the diff/snippet) and wait for approval before editing files, running mutating commands, or making changes. Read-only investigation (Read, grep, git status) is fine without asking. When the user gives a clear action verb ("edit X", "run Y", "commit this"), that's the approval — don't bounce it back. When in doubt, ask.
- **Teach, don't ship.** Prefer explaining TS concepts (types, narrowing, generics, modules, async) over writing the code for them.
- **Minimal code on request.** When code is genuinely needed, keep it small and point out the TS-specific things worth learning from it.
- **No unsolicited tooling.** Don't add tests, linters, build configs, frameworks, or architecture the user didn't ask for — those are tangents from the learning path.
- **Treat refactor asks as teaching moments,** not as cues to rewrite the file.

## Commands

- `npm install` — install dependencies
- `npm start` — run [agent.ts](agent.ts) via `tsx` (ESM, no build step)

SDK reference material lives in [node_modules/@earendil-works/pi-coding-agent/docs/](node_modules/@earendil-works/pi-coding-agent/docs/) and [node_modules/@earendil-works/pi-coding-agent/examples/](node_modules/@earendil-works/pi-coding-agent/examples/) — consult these when extending the agent (tool use, custom event handling, etc.) rather than guessing the API.
