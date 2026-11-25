# Mozaik notes (verified 25 Nov 2026 on `@mozaik-ai/core@4.2.0`)

Read this before touching `src/runtime.ts`, `src/agents/kit.ts` or `src/inference/`.
Every claim below was checked in `docs/reference/mozaik-4.2-spike.ts` or in the package's
type declarations and compiled source.

## Version

- **Pin `4.2.0` exactly.** `npm install @mozaik-ai/core` now installs 5.0.x (published 14 to
  15 Nov), a different product: a single-loop breakpoint harness (`initAgentModule`,
  `createLoop`, `setBreakpoint`, `advanceLoop`) with no runtime, participants or event bus.
- docs.jigjoy.ai and github.com/jigjoy-ai/mozaik-examples describe 4.x. Past winners used 4.x.

## The runtime

```ts
import { defineRuntime, RuntimeState } from "@mozaik-ai/core"
export class HouseholdState extends RuntimeState { /* shared typed state */ }
const rt = defineRuntime<HouseholdState>()
// rt: { initializeRuntime, resolveRuntime, resolveParticipant, join, leave, sendMessage, sendEvent, runLoop }
```

- **Each `defineRuntime()` call owns one runtime, and `initializeRuntime` throws
  "Runtime already initialized" the second time.** The examples call it at module level,
  which allows one run per process. CFOne calls it inside `runClose()` and passes the handle
  to every participant factory, so the web server can run many closes.
- `join(participant)` before anyone emits. `sendEvent(event, senderId)` throws if the sender
  has not joined.
- Fan-out is synchronous: `publish` walks every participant and calls each matching
  handler's `apply` without awaiting it. Keep `apply` cheap; start loops, do not compute in it.
- Custom events: `SemanticEvent.create(type, producerId, payload)` (three arguments in 4.x;
  5.x added a date argument).

## Situation handlers

```ts
class On extends SituationSpecification {
  constructor(private type: string) { super() }
  isSatisfiedBy({ event }: SituationContext) { return event.type === this.type }
}
const handler: SituationHandler = { specification: new On("statement.verified").and(new FromOther()), processor: { apply(ctx) { /* ... */ } } }
```

`and`, `or`, `not` compose specifications. There are no built-in specifications.

## Loops and concurrency

- `runLoop(agentId, message, inferenceInput, interceptionHandler?)` returns `void`
  immediately; the loop (message → inference → tool calls → inference → model message) runs
  on its own. Several `runLoop` calls overlap: that is the concurrency.
- Loop events, each with `loopId` in the payload: `message_received.started|completed`,
  `inference.started`, `inference.stream`, `inference.completed`, `function_call.started`,
  `function_call.completed`, `model.answer`, `interception.started|finished`. A loop ends
  with `model.answer`.
- **An agent's memory is one shared `ModelContext`.** Two loops on it interleave items. For
  concurrent loops, build a fresh context per loop:

```ts
const context = ModelContext.create().addContextItem(DeveloperMessageItem.create(agent.getDeveloperMessage()))
rt.runLoop(agent.getId(), task, { model, maxOutputTokens, context, tools: agent.getTools() }, interception)
```

- **`runLoop` does not catch errors.** A provider error inside a loop is an unhandled
  promise rejection, and Node exits (reproduced). Wrap inference (`SafeRunner`) and install
  `process.on("unhandledRejection", ...)`.
- Tool errors are caught by Mozaik and returned to the model as `Error calling tool: ...`.
  Unknown tool names return `Error: unknown tool "..."`.

## Tools

```ts
const tool: Tool = { type: "function", name: "submit_extraction", description: "...", strict: false,
  parameters: { type: "object", properties: { /* JSON schema */ }, required: [/* ... */], additionalProperties: false },
  invoke: async (args) => ({ ok: true }) }
```

Use `strict: false`: OpenAI strict mode demands every property be required at every depth.

## Interception (the Number Guard)

```ts
class Guard implements InterceptionHandler {
  isSatisfiedBy(t: ExecutableTransition) { return t.nextStateId === "function_call" && (t.input as { call: FunctionCallItem }).call.name === "propose_action" }
  async handle(t: ExecutableTransition): Promise<ExecutableTransition> {
    const { call, inferenceInput } = t.input as { call: FunctionCallItem; inferenceInput: InferenceInput }
    // pass: return t        block: add the call and a BLOCKED output, go back to inference
    inferenceInput.context.addContextItems([call, FunctionCallOutputItem.create(call.callId, "BLOCKED: <reason>")])
    return { nextStateId: "inference", input: inferenceInput }
  }
}
```

One interception handler per loop; compose several checks inside it.

## Models and inference

- Built in: `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-4-5`, `gpt-5.5`,
  `gpt-5.4-mini`, `gemini-3.5-flash` and others (`supportedModels`). Keys come from
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`.
- `new OpenAIChatCompletions(undefined, { baseURL, apiKey })` talks to any OpenAI-compatible
  server (vLLM, Ollama, OpenRouter). Register it as a custom `GenerativeModel` (a copy of a
  built-in spec with your model's name) to run CFOne on a local model.
- **Always set `maxOutputTokens`.** The Anthropic mapper copies it into `max_tokens`, which
  the API requires.
- `initializeRuntime({ state, inferenceRunnerConfig: { runner } })` replaces inference for
  every loop. `DefaultInferenceRunner` needs an `InferenceInputValidator`, which 4.2.0 does
  not export, so CFOne's `EndpointRunner` looks the model up in `supportedModels` (plus any
  custom `GenerativeModel`) and calls `endpoint.infer` or `endpoint.stream` directly.
- `InferenceRunner` is `{ run(input): Promise<InferenceOutput>; stream(input): AsyncGenerator<SemanticEvent> }`.
  `InferenceOutput` is `{ items: (FunctionCallItem | ReasoningItem | ModelMessageItem)[], tokenUsage, rowResponse }`
  (the field really is spelled `rowResponse`). Build items with `FunctionCallItem.rehydrate({ callId, name, args })`
  and `ModelMessageItem.rehydrate({ text })`.
- Context items are text only. PDFs become numbered text before any model sees them.

## Mozaik Cloud

- With `MOZAIK_API_KEY` set (or after `npx @mozaik-ai/cloud-sdk pair`), 4.2.0 sends every
  loop's events to Mozaik Cloud. Payloads are sent in full unless `MOZAIK_REDACTION=content`
  (shape and sizes only) or `all` (event types only).
- Without a key it prints `mozaik cloud: no API key ...` once per loop. `src/logging.ts`
  shows it once.
- Do not also join `@mozaik-ai/cloud-sdk/exporter`: each transport opens its own session and
  every loop would arrive twice.
