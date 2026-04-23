import type { InkosProvider } from "./types.js";

export const QINIU: InkosProvider = {
  id: "qiniu",
  label: "七牛云 AI",
  api: "openai-completions",
  baseUrl: "https://api.qnaigc.com/v1",
  checkModel: "deepseek-v3",
  temperatureRange: [0, 2],
  defaultTemperature: 0.7,
  writingTemperature: 1,
  models: [
    { id: "deepseek-v3", displayName: "DeepSeek V3", maxOutput: 4096, contextWindowTokens: 131072, abilities: { functionCall: true }, enabled: true },
    { id: "deepseek-r1", displayName: "DeepSeek R1", maxOutput: 4096, contextWindowTokens: 65536, abilities: { reasoning: true }, enabled: true },
    { id: "minimax/minimax-m2.1", displayName: "MiniMax M2.1", maxOutput: 131072, contextWindowTokens: 204800, abilities: { reasoning: true, functionCall: true, search: true }, enabled: true, releasedAt: "2025-12-24" },
    { id: "minimax/minimax-m2", displayName: "MiniMax M2", maxOutput: 131072, contextWindowTokens: 204800, abilities: { reasoning: true, functionCall: true, search: true }, enabled: true, releasedAt: "2025-10-27" },
    { id: "deepseek/deepseek-math-v2", displayName: "DeepSeek Math V2", maxOutput: 131072, contextWindowTokens: 163840, abilities: { reasoning: true }, enabled: true, releasedAt: "2025-11-27" },
    { id: "meituan/longcat-flash-chat", displayName: "LongCat Flash Chat", maxOutput: 65536, contextWindowTokens: 131072, abilities: { reasoning: true, functionCall: true }, enabled: true, releasedAt: "2025-09-01" },
    { id: "z-ai/glm-4.7", displayName: "GLM-4.7", maxOutput: 128000, contextWindowTokens: 200000, abilities: { reasoning: true, functionCall: true, search: true }, enabled: true, releasedAt: "2025-12-23" },
    { id: "z-ai/glm-4.6", displayName: "GLM-4.6", maxOutput: 128000, contextWindowTokens: 200000, abilities: { reasoning: true, functionCall: true, search: true }, enabled: true, releasedAt: "2025-09-30" },
    { id: "x-ai/grok-4-fast", displayName: "Grok 4 Fast", maxOutput: 4096, contextWindowTokens: 2000000, abilities: { reasoning: true, vision: true, functionCall: true, search: true }, enabled: true, releasedAt: "2025-09-09" },
    { id: "x-ai/grok-code-fast-1", displayName: "Grok Code Fast 1", maxOutput: 4096, contextWindowTokens: 256000, abilities: { reasoning: true, functionCall: true }, releasedAt: "2025-08-27" },
  ],
};
