import type OpenAI from "openai";
import { PipelineRunner, type PipelineConfig } from "./runner.js";
import type { Platform, Genre } from "../models/book.js";

/** Tool definitions for the agent loop (OpenAI function calling format). */
const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "write_draft",
      description: "写一章草稿。生成正文、更新状态卡/账本/伏笔池、保存章节文件。",
      parameters: {
        type: "object",
        properties: {
          bookId: { type: "string", description: "书籍ID" },
          guidance: { type: "string", description: "本章创作指导（可选，自然语言）" },
        },
        required: ["bookId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "audit_chapter",
      description: "审计指定章节。检查连续性、OOC、数值、伏笔等问题。",
      parameters: {
        type: "object",
        properties: {
          bookId: { type: "string", description: "书籍ID" },
          chapterNumber: { type: "number", description: "章节号（不填则审计最新章）" },
        },
        required: ["bookId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "revise_chapter",
      description: "修订指定章节。根据审计问题做最小幅度修正。",
      parameters: {
        type: "object",
        properties: {
          bookId: { type: "string", description: "书籍ID" },
          chapterNumber: { type: "number", description: "章节号（不填则修订最新章）" },
        },
        required: ["bookId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scan_market",
      description: "扫描市场趋势。从平台排行榜获取实时数据并分析。",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_book",
      description: "创建一本新书。生成世界观、卷纲、文风指南等基础设定。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "书名" },
          genre: { type: "string", enum: ["xuanhuan", "xianxia", "urban", "game", "fanfic", "horror", "short", "other"], description: "题材" },
          platform: { type: "string", enum: ["tomato", "feilu", "qidian", "other"], description: "目标平台" },
          brief: { type: "string", description: "创作简述/需求（自然语言）" },
        },
        required: ["title", "genre", "platform"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_book_status",
      description: "获取书籍状态概览：章数、字数、最近章节审计情况。",
      parameters: {
        type: "object",
        properties: {
          bookId: { type: "string", description: "书籍ID" },
        },
        required: ["bookId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_truth_files",
      description: "读取书籍的三大真相文件（状态卡、资源账本、伏笔池）+ 世界观和卷纲。",
      parameters: {
        type: "object",
        properties: {
          bookId: { type: "string", description: "书籍ID" },
        },
        required: ["bookId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_books",
      description: "列出所有书籍。",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_full_pipeline",
      description: "完整管线：写草稿 → 审计 → 自动修订（如需要）。一键完成。",
      parameters: {
        type: "object",
        properties: {
          bookId: { type: "string", description: "书籍ID" },
          count: { type: "number", description: "连续写几章（默认1）" },
        },
        required: ["bookId"],
      },
    },
  },
];

export interface AgentLoopOptions {
  readonly onToolCall?: (name: string, args: Record<string, unknown>) => void;
  readonly onToolResult?: (name: string, result: string) => void;
  readonly onMessage?: (content: string) => void;
  readonly maxTurns?: number;
}

export async function runAgentLoop(
  config: PipelineConfig,
  instruction: string,
  options?: AgentLoopOptions,
): Promise<string> {
  const pipeline = new PipelineRunner(config);
  const { StateManager } = await import("../state/manager.js");
  const state = new StateManager(config.projectRoot);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `你是 InkOS 的智能编排 agent。你可以调用工具来管理网文创作的全流程。

你的能力：
- 扫描市场趋势（scan_market）
- 创建新书（create_book）
- 写草稿（write_draft）
- 审计章节（audit_chapter）
- 修订章节（revise_chapter）
- 查看书籍状态（get_book_status）
- 读取真相文件（read_truth_files）
- 列出所有书（list_books）
- 一键完整管线（write_full_pipeline）

根据用户的自然语言指令，自主决定调用哪些工具、什么顺序。
如果用户只给了题材或创意但没有明确要扫描市场，直接跳过雷达，用用户提供的信息创建书籍。
每完成一步，简要汇报进展。`,
    },
    { role: "user", content: instruction },
  ];

  const maxTurns = options?.maxTurns ?? 20;
  let lastAssistantMessage = "";

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await config.client.chat.completions.create({
      model: config.model,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
    });

    const choice = response.choices[0];
    const msg = choice.message;

    // Add assistant message to history
    messages.push(msg);

    // If model produced text, emit it
    if (msg.content) {
      lastAssistantMessage = msg.content;
      options?.onMessage?.(msg.content);
    }

    // If no tool calls, we're done
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      break;
    }

    // Execute tool calls
    for (const toolCall of msg.tool_calls) {
      const fn = toolCall.function;
      const args = JSON.parse(fn.arguments) as Record<string, unknown>;

      options?.onToolCall?.(fn.name, args);

      let result: string;
      try {
        result = await executeTool(pipeline, state, config, fn.name, args);
      } catch (e) {
        result = JSON.stringify({ error: String(e) });
      }

      options?.onToolResult?.(fn.name, result);

      messages.push({
        role: "tool" as const,
        content: result,
        tool_call_id: toolCall.id,
      });
    }
  }

  return lastAssistantMessage;
}

async function executeTool(
  pipeline: PipelineRunner,
  state: import("../state/manager.js").StateManager,
  config: PipelineConfig,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "write_draft": {
      const result = await pipeline.writeDraft(
        args.bookId as string,
        args.guidance as string | undefined,
      );
      return JSON.stringify(result);
    }

    case "audit_chapter": {
      const result = await pipeline.auditDraft(
        args.bookId as string,
        args.chapterNumber as number | undefined,
      );
      return JSON.stringify(result);
    }

    case "revise_chapter": {
      const result = await pipeline.reviseDraft(
        args.bookId as string,
        args.chapterNumber as number | undefined,
      );
      return JSON.stringify(result);
    }

    case "scan_market": {
      const result = await pipeline.runRadar();
      return JSON.stringify(result);
    }

    case "create_book": {
      const now = new Date().toISOString();
      const title = args.title as string;
      const bookId = title
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 30);

      const book = {
        id: bookId,
        title,
        platform: ((args.platform as string) ?? "tomato") as Platform,
        genre: ((args.genre as string) ?? "xuanhuan") as Genre,
        status: "outlining" as const,
        targetChapters: 200,
        chapterWordCount: 3000,
        createdAt: now,
        updatedAt: now,
      };

      // If user provided a brief, create a pipeline with that context
      const brief = args.brief as string | undefined;
      if (brief) {
        const contextPipeline = new PipelineRunner({ ...config, externalContext: brief });
        await contextPipeline.initBook(book);
      } else {
        await pipeline.initBook(book);
      }

      return JSON.stringify({ bookId, title, status: "created" });
    }

    case "get_book_status": {
      const result = await pipeline.getBookStatus(args.bookId as string);
      return JSON.stringify(result);
    }

    case "read_truth_files": {
      const result = await pipeline.readTruthFiles(args.bookId as string);
      return JSON.stringify(result);
    }

    case "list_books": {
      const bookIds = await state.listBooks();
      const books = await Promise.all(
        bookIds.map(async (id) => {
          try {
            return await pipeline.getBookStatus(id);
          } catch {
            return { bookId: id, error: "failed to load" };
          }
        }),
      );
      return JSON.stringify(books);
    }

    case "write_full_pipeline": {
      const count = (args.count as number) ?? 1;
      const results = [];
      for (let i = 0; i < count; i++) {
        const result = await pipeline.writeNextChapter(args.bookId as string);
        results.push(result);
      }
      return JSON.stringify(results);
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

/** Export tool definitions so OpenClaw or other systems can reference them. */
export { TOOLS as AGENT_TOOLS };
