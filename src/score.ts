/**
 * 参考评分器（v1）
 *
 * 实现「遗器 / 角色」到百分制分数的合成算法，是评分规范的权威实现；
 * 后端 characterScoreService 必须产出与此一致的结果（由金样本对齐保证）。
 *
 * 与历史算法的差异（见 docs/ALGORITHM.md）：
 * - 去掉对遗器分的开方（sqrt），分数线性反映真实价值，高分段区分度更高；
 * - 主副词条按 0.35 / 0.65 加权（副词条主导），主词条更接近「门槛」定位。
 * 原材料 main / weight / maxV2 的语义不变。
 */
import { PartId, RelicInput, ScoreConfigItem } from "./types";

/** 合成权重：遗器分 = MAIN_WEIGHT×主词条分 + SUB_WEIGHT×副词条分 */
export const MAIN_WEIGHT = 0.35;
export const SUB_WEIGHT = 0.65;

const PART_IDS: PartId[] = ["1", "2", "3", "4", "5", "6"];

/** 单条副词条的得分明细 */
export interface SubScoreDetail {
  type: string;
  count: number;
  weight: number;
  deltaScore: number;
}

/** 单件遗器评分结果 */
export interface RelicScore {
  part: PartId;
  /** 主词条得分 0~1 */
  mainScore: number;
  /** 副词条得分 0~1（已对 maxV2 归一） */
  subScore: number;
  /** 副词条原始累加分（未归一） */
  subRawScore: number;
  /** 遗器综合分 0~1 */
  score: number;
  subDetails: SubScoreDetail[];
}

/** 角色整体评分结果 */
export interface CharacterScore {
  /** 0~1 */
  score: number;
  /** 百分制 0~100 */
  percent: number;
  relics: RelicScore[];
  /** 未提供的部位编号 */
  missingParts: PartId[];
}

/** 主词条得分：随等级线性逼近其在该部位的价值 */
function computeMainScore(relic: RelicInput, config: ScoreConfigItem): number {
  const weight = config.main[relic.part]?.[relic.mainType] ?? 0;
  if (!(weight > 0)) return 0;
  const normalizedLevel = Math.min(Math.max((relic.level + 1) / 16, 0), 1);
  return normalizedLevel * weight;
}

/** 副词条得分：各词条 count×权重 累加后，对该部位 maxV2 归一 */
function computeSubScore(
  relic: RelicInput,
  config: ScoreConfigItem,
): { score: number; rawScore: number; details: SubScoreDetail[] } {
  const maxScore = config.maxV2?.[relic.part] ?? 0;
  const details: SubScoreDetail[] = [];
  if (!(maxScore > 0)) return { score: 0, rawScore: 0, details };

  let rawScore = 0;
  for (const sub of relic.subAffixes) {
    const weight = config.weight?.[sub.type] ?? 0;
    if (!(weight > 0) || !(sub.count > 0)) continue;
    const deltaScore = sub.count * weight;
    rawScore += deltaScore;
    details.push({ type: sub.type, count: sub.count, weight, deltaScore });
  }
  return { score: Math.min(1, rawScore / maxScore), rawScore, details };
}

/** 计算单件遗器评分 */
export function scoreRelic(
  relic: RelicInput,
  config: ScoreConfigItem,
): RelicScore {
  const mainScore = computeMainScore(relic, config);
  const { score: subScore, rawScore, details } = computeSubScore(relic, config);
  const score = Math.min(
    1,
    Math.max(0, MAIN_WEIGHT * mainScore + SUB_WEIGHT * subScore),
  );
  return {
    part: relic.part,
    mainScore,
    subScore,
    subRawScore: rawScore,
    score,
    subDetails: details,
  };
}

/**
 * 计算角色整体评分：6 个部位遗器分的平均。
 * 缺失部位按 0 计入分母，鼓励配满 6 件。
 */
export function scoreCharacter(
  relics: RelicInput[],
  config: ScoreConfigItem,
): CharacterScore {
  const byPart = new Map<PartId, RelicScore>();
  const relicScores: RelicScore[] = [];
  for (const relic of relics) {
    const rs = scoreRelic(relic, config);
    relicScores.push(rs);
    byPart.set(relic.part, rs);
  }

  const missingParts: PartId[] = [];
  let sum = 0;
  for (const part of PART_IDS) {
    const rs = byPart.get(part);
    if (rs) sum += rs.score;
    else missingParts.push(part);
  }
  const score = sum / 6;
  return {
    score,
    percent: Math.round(score * 100 * 100) / 100,
    relics: relicScores,
    missingParts,
  };
}
