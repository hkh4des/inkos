import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listModelsForService } from "../llm/service-presets.js";

describe("listModelsForService (B8)", () => {
  const originalEnv = process.env.INKOS_LLM_MODEL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    delete process.env.INKOS_LLM_MODEL;
  });

  afterEach(() => {
    if (originalEnv) process.env.INKOS_LLM_MODEL = originalEnv;
    else delete process.env.INKOS_LLM_MODEL;
    global.fetch = originalFetch;
  });

  it("anthropic service 无 apikey 时返回 provider 内置 enabled 子集", async () => {
    const models = await listModelsForService("anthropic");
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m) => m.id === "claude-sonnet-4-6")).toBe(true);
    const sonnet = models.find((m) => m.id === "claude-sonnet-4-6");
    expect(sonnet?.maxOutput).toBe(64_000);
    expect(sonnet?.contextWindow).toBe(1_000_000);
    expect(sonnet?.reasoning).toBe(true);
  });

  it("custom service 走 live probe + bank 补元数据", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-4o" }, { id: "my-proxy-model" }] }),
    } as any) as typeof fetch;
    const models = await listModelsForService("custom", "sk-test", "https://myproxy.example/v1");
    // gpt-4o 命中 openai provider，拿到元数据
    const gpt = models.find((m) => m.id === "gpt-4o");
    expect(gpt).toBeDefined();
    expect(gpt?.maxOutput).toBe(4096);
    // 自定义 id 没元数据也保留
    expect(models.some((m) => m.id === "my-proxy-model")).toBe(true);
  });

  it("INKOS_LLM_MODEL env 补丁：live/provider 都没有时补进列表", async () => {
    process.env.INKOS_LLM_MODEL = "my-secret-model";
    const models = await listModelsForService("anthropic");
    expect(models.some((m) => m.id === "my-secret-model")).toBe(true);
  });

  it("live 挂了降级到 provider 内置 models（没有 fetch 错误 crash）", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as typeof fetch;
    const models = await listModelsForService("anthropic", "sk-test");
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m) => m.id === "claude-sonnet-4-6")).toBe(true);
  });

  it("未知 service 返回空数组", async () => {
    const models = await listModelsForService("nonexistent-xyz");
    expect(models).toEqual([]);
  });
});
