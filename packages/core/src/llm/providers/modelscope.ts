import type { InkosProvider } from "./types.js";

export const MODELSCOPE: InkosProvider = {
  id: "modelscope",
  label: "魔搭社区 ModelScope",
  api: "openai-completions",
  baseUrl: "https://api-inference.modelscope.cn/v1",
  checkModel: "Qwen/Qwen2.5-72B-Instruct",
  temperatureRange: [0, 2],
  defaultTemperature: 0.7,
  writingTemperature: 1,
  models: [
    { id: "Qwen/Qwen3-Next-80B-A3B-Thinking", displayName: "Qwen3 Next 80B A3B Thinking", maxOutput: 4096, contextWindowTokens: 131072, abilities: { reasoning: true, functionCall: true } },
    { id: "Qwen/Qwen3-Next-80B-A3B-Instruct", displayName: "Qwen3 Next 80B A3B Instruct", maxOutput: 4096, contextWindowTokens: 131072, abilities: { functionCall: true } },
    { id: "deepseek-ai/DeepSeek-V3.2", displayName: "DeepSeek V3.2", maxOutput: 4096, contextWindowTokens: 131072, abilities: { reasoning: true, functionCall: true }, enabled: true },
    { id: "deepseek-ai/DeepSeek-V3.2-Exp", displayName: "DeepSeek V3.2 Exp", maxOutput: 4096, contextWindowTokens: 131072, abilities: { reasoning: true, functionCall: true } },
    { id: "deepseek-ai/DeepSeek-V3.1", displayName: "DeepSeek V3.1", maxOutput: 4096, contextWindowTokens: 131072, abilities: { reasoning: true, functionCall: true } },
    { id: "deepseek-ai/DeepSeek-R1-0528", displayName: "DeepSeek R1 0528", maxOutput: 4096, contextWindowTokens: 131072, abilities: { reasoning: true, functionCall: true } },
    { id: "Qwen/Qwen3-235B-A22B", displayName: "Qwen3 235B A22B", maxOutput: 4096, contextWindowTokens: 131072, abilities: { functionCall: true } },
    { id: "Qwen/Qwen3-32B", displayName: "Qwen3 32B", maxOutput: 4096, contextWindowTokens: 131072, abilities: { functionCall: true } },
  ],
};
