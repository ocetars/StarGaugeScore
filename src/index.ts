/**
 * StarGaugeScore 公共入口
 *
 * 评分策略的唯一真相源：生成评分配置（score.json）+ 参考评分器。
 */
export * from "./types";
export { generateScoreMap } from "./generate";
export {
  scoreRelic,
  scoreCharacter,
  MAIN_WEIGHT,
  SUB_WEIGHT,
  type RelicScore,
  type CharacterScore,
  type SubScoreDetail,
} from "./score";
