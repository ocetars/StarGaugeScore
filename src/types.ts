/**
 * 评分相关类型定义
 *
 * 词条 key 沿用游戏内部命名（StarRailRes / SDK 同款），如 CriticalChanceBase、
 * AttackAddedRatio、HPDelta。部位用 1~6 表示 头/手/身/脚/位面球/连结绳。
 */

/** 遗器部位编号：1 头 / 2 手 / 3 身 / 4 脚 / 5 位面球 / 6 连结绳 */
export type PartId = "1" | "2" | "3" | "4" | "5" | "6";

/** 副词条价值表：词条 key -> 权重（0~1） */
export type SubWeightMap = Record<string, number>;

/** 主词条价值表：部位 -> (词条 key -> 权重 0~1) */
export type MainWeightMap = Record<PartId, Record<string, number>>;

/** 每部位的副词条理论上限（评分分母） */
export type SubMaxMap = Record<PartId, number>;

/** 单角色评分配置（score.json 的 value） */
export interface ScoreConfigItem {
  /** 主词条价值，按部位 */
  mainWeight: MainWeightMap;
  /** 副词条价值，全部位共用 */
  subWeight: SubWeightMap;
  /** 副词条理论上限，按部位，作评分分母 */
  subMax: SubMaxMap;
}

/** score.json 全量：角色 id -> 配置 */
export type ScoreMap = Record<string, ScoreConfigItem>;

// ── 生成器输入（data/） ────────────────────────────────────────────────

/** 角色基础数据（随版本更新，非人工评分判断） */
export interface AvatarConfig {
  id: string;
  name: string;
  /** 命途：Warrior/Rogue/Mage/Shaman/Warlock/Knight/Priest/Memory/Elation */
  path: string;
  /** 伤害属性：Physical/Fire/Ice/Thunder/Wind/Quantum/Imaginary */
  damageType: string;
}

/** 每角色一行的属性价值表（主、副共用同一形状，人工维护的核心资产） */
export interface AffixValueRow {
  AvatarID: number;
  Attack?: number;
  HP?: number;
  Defence?: number;
  Speed?: number;
  CriticalChance?: number;
  CriticalDamage?: number;
  StatusProbability?: number;
  StatusResistance?: number;
  BreakDamage?: number;
  /** 仅主词条表用：对应角色属性的伤害加成球 */
  DamageAddedRatio?: number;
  /** 仅主词条表用：能量恢复绳 */
  SPRatio?: number;
  /** 仅主词条表用：治疗量身 */
  HealRatio?: number;
}

/** 推荐主词条项（来自游戏推荐数据） */
export interface RelicRecommendProperty {
  RelicType: "HEAD" | "HAND" | "BODY" | "FOOT" | "NECK" | "OBJECT";
  PropertyType: string;
}

/** 角色推荐数据（只用到 PropertyList） */
export interface AvatarRelicRecommend {
  AvatarID: number;
  PropertyList: RelicRecommendProperty[];
}

// ── 评分器输入 ─────────────────────────────────────────────────────────

/** 单条副词条 */
export interface SubAffixInput {
  /** 词条 key，如 CriticalDamageBase */
  type: string;
  /** 强化次数（含初始档），与 Mihomo/Enka count 同义 */
  count: number;
}

/** 单件遗器评分输入 */
export interface RelicInput {
  part: PartId;
  /** 主词条 key */
  mainType: string;
  /** 主词条等级 0~15 */
  level: number;
  subAffixes: SubAffixInput[];
}
