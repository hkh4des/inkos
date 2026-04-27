import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const { agentInstances, streamCalls } = vi.hoisted(() => ({
  agentInstances: [] as any[],
  streamCalls: [] as Array<{ model: any; context: any }>,
}));

vi.mock("@mariozechner/pi-agent-core", async () => {
  const actual = await vi.importActual<any>("@mariozechner/pi-agent-core");
  class SpyAgent extends actual.Agent {
    constructor(options: any) {
      super(options);
      agentInstances.push(this);
    }
  }
  return { ...actual, Agent: SpyAgent };
});

vi.mock("@mariozechner/pi-ai", async () => {
  const actual = await vi.importActual<any>("@mariozechner/pi-ai");

  function clone(value: unknown): unknown {
    return JSON.parse(JSON.stringify(value));
  }

  function textFromContent(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
      .filter((block: any) => block?.type === "text" && typeof block.text === "string")
      .map((block: any) => block.text)
      .join("");
  }

  function lastVisibleUserText(messages: any[]): string {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === "user") return textFromContent(message.content);
    }
    return "";
  }

  function assistant(content: any[], timestamp = Date.now()) {
    return {
      role: "assistant",
      content,
      api: "anthropic-messages",
      provider: "anthropic",
      model: "fake",
      usage: EMPTY_USAGE,
      stopReason: content.some((block) => block.type === "toolCall") ? "toolUse" : "stop",
      timestamp,
    };
  }

  const streamSimple = vi.fn((model: any, context: any) => {
    streamCalls.push({ model: clone(model), context: clone(context) });
    const stream = actual.createAssistantMessageEventStream();
    const last = context.messages.at(-1);
    const prompt = lastVisibleUserText(context.messages);
    const timestamp = Date.now();
    const message = last?.role === "toolResult"
      ? assistant([{ type: "text", text: "ok" }], timestamp)
      : prompt === "model error"
        ? {
            role: "assistant",
            content: [],
            api: "anthropic-messages",
            provider: "anthropic",
            model: "fake",
            usage: EMPTY_USAGE,
            stopReason: "error",
            errorMessage: "400 status code (no body)",
            timestamp,
          }
        : prompt === "think"
        ? assistant([
            { type: "thinking", thinking: "raw thought", thinkingSignature: "sig-1" },
            { type: "text", text: "ok" },
          ], timestamp)
        : prompt === "use tool"
          ? assistant([
              {
                type: "toolCall",
                id: "tool-1",
                name: "read",
                arguments: { path: "book-a/story/story_bible.md" },
              },
            ], timestamp)
          : assistant([{ type: "text", text: "ok" }], timestamp);

    stream.push({
      type: "done",
      reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
      message,
    });
    return stream;
  });

  return {
    ...actual,
    streamSimple,
    getEnvApiKey: vi.fn(() => "fake-key"),
    getModel: vi.fn((provider: string, id: string) => ({
      provider,
      id,
      name: id,
      api: "anthropic-messages",
      baseUrl: "",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200_000,
      maxTokens: 4096,
    })),
  };
});

import { runAgentSession, evictAgentCache } from "../agent/agent-session.js";
import { appendTranscriptEvent, readTranscriptEvents } from "../interaction/session-transcript.js";

describe("runAgentSession cache — bookId switch", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "inkos-agent-cache-"));
    await mkdir(join(projectRoot, "books", "book-a", "story"), { recursive: true });
    await writeFile(
      join(projectRoot, "books", "book-a", "story", "story_bible.md"),
      "书A 的真相",
    );
    await mkdir(join(projectRoot, "books", "book-b", "story"), { recursive: true });
    await writeFile(
      join(projectRoot, "books", "book-b", "story", "story_bible.md"),
      "书B 的真相",
    );
    agentInstances.length = 0;
    streamCalls.length = 0;
  });

  afterEach(async () => {
    evictAgentCache("s1");
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("rebuilds Agent when bookId changes for same sessionId", async () => {
    const model = { provider: "x", id: "y", api: "anthropic-messages" } as any;
    const pipeline = {} as any;

    await runAgentSession(
      { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model },
      "earlier question about book A",
    );
    expect(agentInstances).toHaveLength(1);

    await runAgentSession(
      { sessionId: "s1", bookId: "book-b", language: "zh", pipeline, projectRoot, model },
      "new question",
    );

    expect(agentInstances).toHaveLength(2);

    const body = JSON.stringify(streamCalls.at(-1)?.context.messages);
    expect(body).toContain("书B 的真相");
    expect(body).not.toContain("书A 的真相");
    expect(body).toContain("earlier question about book A");
  });

  it("rebuilds Agent when bookId goes from null to a real book", async () => {
    const model = { provider: "x", id: "y", api: "anthropic-messages" } as any;
    const pipeline = {} as any;

    await runAgentSession(
      { sessionId: "s1", bookId: null, language: "zh", pipeline, projectRoot, model },
      "hi",
    );
    expect(agentInstances).toHaveLength(1);

    await runAgentSession(
      { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model },
      "hi",
    );

    expect(agentInstances).toHaveLength(2);
    expect(JSON.stringify(streamCalls.at(-1)?.context.messages)).toContain("书A 的真相");
  });

  it("treats undefined bookId as null (no spurious rebuild)", async () => {
    const model = { provider: "x", id: "y", api: "anthropic-messages" } as any;
    const pipeline = {} as any;

    await runAgentSession(
      { sessionId: "s1", bookId: null, language: "zh", pipeline, projectRoot, model },
      "hi",
    );
    expect(agentInstances).toHaveLength(1);

    await runAgentSession(
      { sessionId: "s1", bookId: undefined as any, language: "zh", pipeline, projectRoot, model },
      "hi",
    );

    expect(agentInstances).toHaveLength(1);
  });

  it("reuses Agent when bookId unchanged on same sessionId", async () => {
    const model = { provider: "x", id: "y", api: "anthropic-messages" } as any;
    const pipeline = {} as any;

    await runAgentSession(
      { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model },
      "hi",
    );
    await runAgentSession(
      { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model },
      "hi2",
    );

    expect(agentInstances).toHaveLength(1);
  });

  it("rebuilds Agent when model id is unchanged but API protocol changes", async () => {
    const pipeline = {} as any;
    const legacyGoogle = {
      provider: "openai",
      id: "gemini-pro-latest",
      api: "openai-completions",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      input: ["text"],
    } as any;
    const nativeGoogle = {
      provider: "google",
      id: "gemini-pro-latest",
      api: "google-generative-ai",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      input: ["text"],
    } as any;

    await runAgentSession(
      { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model: legacyGoogle },
      "hi",
    );
    await runAgentSession(
      { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model: nativeGoogle },
      "hi2",
    );

    expect(agentInstances).toHaveLength(2);
    expect(streamCalls.at(-1)?.model.api).toBe("google-generative-ai");
    expect(streamCalls.at(-1)?.model.provider).toBe("google");
  });

  it("rebuilds Agent when model baseUrl changes", async () => {
    const pipeline = {} as any;
    const first = { provider: "openai", id: "same-model", api: "openai-completions", baseUrl: "https://one.example/v1", input: ["text"] } as any;
    const second = { provider: "openai", id: "same-model", api: "openai-completions", baseUrl: "https://two.example/v1", input: ["text"] } as any;

    await runAgentSession(
      { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model: first },
      "hi",
    );
    await runAgentSession(
      { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model: second },
      "hi2",
    );

    expect(agentInstances).toHaveLength(2);
    expect(streamCalls.at(-1)?.model.baseUrl).toBe("https://two.example/v1");
  });

  it("enables system file read by default for the session read tool", async () => {
    const model = { provider: "x", id: "y", api: "anthropic-messages" } as any;
    const pipeline = {} as any;
    const outsidePath = join(projectRoot, "outside.md");
    await writeFile(outsidePath, "outside content", "utf-8");

    await runAgentSession(
      { sessionId: "s1", bookId: null, language: "zh", pipeline, projectRoot, model },
      "hi",
    );

    const readTool = agentInstances[0].state.tools.find((tool: any) => tool.name === "read");
    const result = await readTool.execute("tool-read-default-session", { path: outsidePath });

    expect(result.content[0]?.type).toBe("text");
    if (result.content[0]?.type === "text") {
      expect(result.content[0].text).toContain("outside content");
    }
  });

  it("can explicitly disable system file read for the session read tool", async () => {
    const model = { provider: "x", id: "y", api: "anthropic-messages" } as any;
    const pipeline = {} as any;
    const outsidePath = join(projectRoot, "outside.md");
    await writeFile(outsidePath, "outside content", "utf-8");

    await runAgentSession(
      {
        sessionId: "s1",
        bookId: null,
        language: "zh",
        pipeline,
        projectRoot,
        model,
        allowSystemFileRead: false,
      },
      "hi",
    );

    const readTool = agentInstances[0].state.tools.find((tool: any) => tool.name === "read");
    const result = await readTool.execute("tool-read-disabled-session", { path: outsidePath });

    expect(result.content[0]?.type).toBe("text");
    if (result.content[0]?.type === "text") {
      expect(result.content[0].text).toContain("Path traversal blocked");
      expect(result.content[0].text).not.toContain("outside content");
    }
  });

  it("把真实 Agent 的 message_end 写入 JSONL，并在 cache 失效后恢复 raw AgentMessage", async () => {
    const model = { provider: "anthropic", id: "fake", api: "anthropic-messages" } as any;
    const pipeline = {} as any;

    await runAgentSession(
      { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model },
      "think",
    );

    const events = await readTranscriptEvents(projectRoot, "s1");
    expect(events.map((event) => event.type)).toContain("request_committed");

    evictAgentCache("s1");

    await runAgentSession(
      { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model },
      "again",
    );

    expect(agentInstances).toHaveLength(2);
    expect(JSON.stringify(streamCalls.at(-1)?.context.messages)).toContain("raw thought");
    expect(streamCalls.at(-1)?.context.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "assistant" }),
      ]),
    );
  });

  it("恢复 transcript 中的 toolResult message", async () => {
    const model = { provider: "anthropic", id: "fake", api: "anthropic-messages" } as any;
    const pipeline = {} as any;

    await runAgentSession(
      { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model },
      "use tool",
    );

    evictAgentCache("s1");

    await runAgentSession(
      { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model },
      "again",
    );

    expect(agentInstances).toHaveLength(2);
    expect(streamCalls.at(-1)?.context.messages.some(
      (message: any) => message.role === "toolResult" && message.toolCallId === "tool-1",
    )).toBe(true);

    const messageEvents = (await readTranscriptEvents(projectRoot, "s1"))
      .filter((event) => event.type === "message");
    const toolAssistant = messageEvents.find(
      (event: any) => event.toolCallId === "tool-1" && event.role === "assistant",
    ) as any;
    const toolResult = messageEvents.find(
      (event: any) => event.toolCallId === "tool-1" && event.role === "toolResult",
    ) as any;
    expect(toolResult.sourceToolAssistantUuid).toBe(toolAssistant.uuid);
  });

  it("Gemini OpenAI-compatible 模型不向 LLM replay 原生 toolCall/toolResult 历史", async () => {
    const model = {
      provider: "google",
      id: "gemini-pro-latest",
      api: "openai-completions",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      input: ["text"],
    } as any;
    const pipeline = {} as any;

    await runAgentSession(
      { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model },
      "use tool",
    );

    const lastContextMessages = streamCalls.at(-1)?.context.messages ?? [];
    const body = JSON.stringify(lastContextMessages);

    expect(lastContextMessages.some((message: any) => message.role === "toolResult")).toBe(false);
    expect(body).not.toContain("\"toolCall\"");
    expect(lastContextMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("[Tool results]"),
        }),
      ]),
    );
    expect(body).toContain("read");
    expect(body).toContain("tool-1");
    expect(body).toContain("书A 的真相");
  });

  it("Gemini OpenAI-compatible 上下文过滤恢复时补出的 toolResult bridge", async () => {
    const model = {
      provider: "google",
      id: "gemini-pro-latest",
      api: "openai-completions",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      input: ["text"],
    } as any;
    const pipeline = {} as any;

    await appendTranscriptEvent(projectRoot, {
      type: "request_started",
      version: 1,
      sessionId: "s1",
      requestId: "r1",
      seq: 1,
      timestamp: 1,
      input: "use tool",
    });
    await appendTranscriptEvent(projectRoot, {
      type: "message",
      version: 1,
      sessionId: "s1",
      requestId: "r1",
      uuid: "u1",
      parentUuid: null,
      seq: 2,
      role: "user",
      timestamp: 2,
      message: { role: "user", content: "use tool", timestamp: 2 },
    } as any);
    await appendTranscriptEvent(projectRoot, {
      type: "message",
      version: 1,
      sessionId: "s1",
      requestId: "r1",
      uuid: "a1",
      parentUuid: "u1",
      seq: 3,
      role: "assistant",
      timestamp: 3,
      toolCallId: "tool-1",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "book-a/story/story_bible.md" } }],
        api: "openai-completions",
        provider: "openai",
        model: "gemini-pro-latest",
        usage: EMPTY_USAGE,
        stopReason: "toolUse",
        timestamp: 3,
      },
    } as any);
    await appendTranscriptEvent(projectRoot, {
      type: "message",
      version: 1,
      sessionId: "s1",
      requestId: "r1",
      uuid: "t1",
      parentUuid: "a1",
      seq: 4,
      role: "toolResult",
      timestamp: 4,
      toolCallId: "tool-1",
      sourceToolAssistantUuid: "a1",
      message: {
        role: "toolResult",
        toolCallId: "tool-1",
        toolName: "read",
        content: [{ type: "text", text: "资料" }],
        isError: false,
        timestamp: 4,
      },
    } as any);
    await appendTranscriptEvent(projectRoot, {
      type: "request_committed",
      version: 1,
      sessionId: "s1",
      requestId: "r1",
      seq: 5,
      timestamp: 5,
    });

    await runAgentSession(
      { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model },
      "again",
    );

    const body = JSON.stringify(streamCalls.at(-1)?.context.messages ?? []);
    expect(body).not.toContain("I have processed the tool results.");
    expect(body).toContain("[Tool results]");
    expect(body).toContain("资料");
  });

  it("切到 DeepSeek 时不 replay 其他模型的原生 toolCall/toolResult 历史", async () => {
    const pipeline = {} as any;
    await appendTranscriptEvent(projectRoot, {
      type: "request_started",
      version: 1,
      sessionId: "s1",
      requestId: "r1",
      seq: 1,
      timestamp: 1,
      input: "use tool",
    });
    await appendTranscriptEvent(projectRoot, {
      type: "message",
      version: 1,
      sessionId: "s1",
      requestId: "r1",
      uuid: "a1",
      parentUuid: null,
      seq: 2,
      role: "assistant",
      timestamp: 2,
      toolCallId: "tool-1",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "book-a/story/story_bible.md" } }],
        api: "openai-completions",
        provider: "openai",
        model: "gemini-pro-latest",
        usage: EMPTY_USAGE,
        stopReason: "toolUse",
        timestamp: 2,
      },
    } as any);
    await appendTranscriptEvent(projectRoot, {
      type: "message",
      version: 1,
      sessionId: "s1",
      requestId: "r1",
      uuid: "t1",
      parentUuid: "a1",
      seq: 3,
      role: "toolResult",
      timestamp: 3,
      toolCallId: "tool-1",
      sourceToolAssistantUuid: "a1",
      message: {
        role: "toolResult",
        toolCallId: "tool-1",
        toolName: "read",
        content: [{ type: "text", text: "资料" }],
        isError: false,
        timestamp: 3,
      },
    } as any);
    await appendTranscriptEvent(projectRoot, {
      type: "request_committed",
      version: 1,
      sessionId: "s1",
      requestId: "r1",
      seq: 4,
      timestamp: 4,
    });

    await runAgentSession(
      {
        sessionId: "s1",
        bookId: "book-a",
        language: "zh",
        pipeline,
        projectRoot,
        model: { provider: "openai", id: "deepseek-v4-pro", api: "openai-completions", input: ["text"] } as any,
      },
      "again",
    );

    const messages = streamCalls.at(-1)?.context.messages ?? [];
    const body = JSON.stringify(messages);
    expect(body).not.toContain("\"toolCall\"");
    expect(messages.some((message: any) => message.role === "toolResult")).toBe(false);
    expect(body).toContain("[Tool results]");
    expect(body).toContain("资料");
  });

  it("返回 pi-agent-core final assistant error，供 API 层保留真实根因", async () => {
    const model = { provider: "x", id: "y", api: "anthropic-messages" } as any;
    const pipeline = {} as any;

    const result = await runAgentSession(
      { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model },
      "model error",
    );

    expect(result.responseText).toBe("");
    expect(result.errorMessage).toBe("400 status code (no body)");
  });
});
