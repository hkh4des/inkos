import type { InkosProvider } from "./types.js";
import { ANTHROPIC } from "./anthropic.js";
import { OPENAI } from "./openai.js";
import { GOOGLE } from "./google.js";
import { DEEPSEEK } from "./deepseek.js";
import { QWEN } from "./qwen.js";
import { MINIMAX } from "./minimax.js";
// B1
import { MOONSHOT } from "./moonshot.js";
import { ZHIPU } from "./zhipu.js";
import { SILICONCLOUD } from "./siliconcloud.js";
import { PPIO } from "./ppio.js";
import { BAILIAN } from "./bailian.js";
import { VOLCENGINE } from "./volcengine.js";
import { HUNYUAN } from "./hunyuan.js";
import { BAICHUAN } from "./baichuan.js";
import { STEPFUN } from "./stepfun.js";
import { WENXIN } from "./wenxin.js";
// B2
import { SPARK } from "./spark.js";
import { SENSENOVA } from "./sensenova.js";
import { TENCENTCLOUD } from "./tencentcloud.js";
import { XIAOMI_MIMO } from "./xiaomimimo.js";
import { LONGCAT } from "./longcat.js";
import { INTERNLM } from "./internlm.js";
// B3
import { MODELSCOPE } from "./modelscope.js";
import { GITEEAI } from "./giteeai.js";
import { QINIU } from "./qiniu.js";
import { HIGRESS } from "./higress.js";
import { INFINIAI } from "./infiniai.js";
import { ZEROONE } from "./zeroone.js";
import { AI360 } from "./ai360.js";

export type { InkosProvider, InkosModel, ApiProtocol } from "./types.js";

/**
 * 所有已注册 provider 的扁平列表。顺序定义了 lookup Layer 2 的遍历顺序，
 * 但 Layer 2 还会按 PROVIDER_PRIORITY 显式排序，所以此处顺序不影响结果。
 */
const ALL_PROVIDERS: readonly InkosProvider[] = [
  ANTHROPIC, OPENAI, GOOGLE, DEEPSEEK, QWEN, MINIMAX,
  MOONSHOT, ZHIPU, SILICONCLOUD, PPIO, BAILIAN, VOLCENGINE, HUNYUAN, BAICHUAN, STEPFUN, WENXIN,
  SPARK, SENSENOVA, TENCENTCLOUD, XIAOMI_MIMO, LONGCAT, INTERNLM,
  MODELSCOPE, GITEEAI, QINIU, HIGRESS, INFINIAI, ZEROONE, AI360,
];

const PROVIDERS_BY_ID: Map<string, InkosProvider> = new Map(
  ALL_PROVIDERS.map((p) => [p.id, p]),
);

export function getAllProviders(): readonly InkosProvider[] {
  return ALL_PROVIDERS;
}

export function getProvider(id: string): InkosProvider | undefined {
  return PROVIDERS_BY_ID.get(id);
}
