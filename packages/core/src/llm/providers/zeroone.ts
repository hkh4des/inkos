import type { InkosProvider } from "./types.js";

export const ZEROONE: InkosProvider = {
  id: "zeroone",
  label: "零一万物 (01.AI)",
  api: "openai-completions",
  baseUrl: "https://api.lingyiwanwu.com/v1",
  checkModel: "yi-lightning",
  temperatureRange: [0, 2],
  defaultTemperature: 0.3,
  writingTemperature: 1,
  models: [
    { id: "yi-lightning", displayName: "Yi Lightning", maxOutput: 4096, contextWindowTokens: 16384, enabled: true },
    { id: "yi-vision-v2", displayName: "Yi Vision V2", maxOutput: 4096, contextWindowTokens: 16384, abilities: { vision: true }, enabled: true },
    { id: "yi-spark", displayName: "Yi Spark", maxOutput: 4096, contextWindowTokens: 16384 },
    { id: "yi-medium", displayName: "Yi Medium", maxOutput: 4096, contextWindowTokens: 16384 },
    { id: "yi-medium-200k", displayName: "Yi Medium 200K", maxOutput: 4096, contextWindowTokens: 200000 },
    { id: "yi-large-turbo", displayName: "Yi Large Turbo", maxOutput: 4096, contextWindowTokens: 16384 },
    { id: "yi-large-rag", displayName: "Yi Large RAG", maxOutput: 4096, contextWindowTokens: 16384 },
    { id: "yi-large-fc", displayName: "Yi Large FC", maxOutput: 4096, contextWindowTokens: 32768, abilities: { functionCall: true } },
    { id: "yi-large", displayName: "Yi Large", maxOutput: 4096, contextWindowTokens: 32768 },
    { id: "yi-vision", displayName: "Yi Vision", maxOutput: 4096, contextWindowTokens: 16384, abilities: { vision: true } },
    { id: "yi-large-preview", displayName: "Yi Large Preview", maxOutput: 4096, contextWindowTokens: 16384 },
    { id: "yi-lightning-lite", displayName: "Yi Lightning Lite", maxOutput: 4096, contextWindowTokens: 16384 },
  ],
};
