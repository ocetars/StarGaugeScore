/**
 * 评分配置生成器
 *
 * 把人工维护的属性价值表（mainAffixValues / subAffixValues）+ 角色基础数据
 * （avatarConfig）展开成后端消费的 score.json
 * （每角色 mainWeight / subWeight / subMax）。
 */
import fs from "fs";
import path from "path";
import {
  AffixValueRow,
  AvatarConfig,
  PartId,
  ScoreConfigItem,
  ScoreMap,
} from "./types";

const DATA_DIR = path.resolve(__dirname, "../data");

const PART_IDS: PartId[] = ["1", "2", "3", "4", "5", "6"];

// 角色伤害属性 -> 对应的位面球伤害加成词条 key
const DAMAGE_TYPE_TO_SPHERE: Record<string, string> = {
  Physical: "PhysicalAddedRatio",
  Fire: "FireAddedRatio",
  Ice: "IceAddedRatio",
  Thunder: "ThunderAddedRatio",
  Wind: "WindAddedRatio",
  Quantum: "QuantumAddedRatio",
  Imaginary: "ImaginaryAddedRatio",
};

/** 每个角色配置的初始骨架 */
function makeInitConfig(): ScoreConfigItem {
  return {
    mainWeight: {
      "1": { HPDelta: 1 },
      "2": { AttackDelta: 1 },
      "3": {
        HPAddedRatio: 0,
        AttackAddedRatio: 0,
        DefenceAddedRatio: 0,
        CriticalChanceBase: 0,
        CriticalDamageBase: 0,
        HealRatioBase: 0,
        StatusProbabilityBase: 0,
      },
      "4": {
        HPAddedRatio: 0,
        AttackAddedRatio: 0,
        DefenceAddedRatio: 0,
        SpeedDelta: 0,
      },
      "5": {
        HPAddedRatio: 0,
        AttackAddedRatio: 0,
        DefenceAddedRatio: 0,
        PhysicalAddedRatio: 0,
        FireAddedRatio: 0,
        IceAddedRatio: 0,
        ThunderAddedRatio: 0,
        WindAddedRatio: 0,
        QuantumAddedRatio: 0,
        ImaginaryAddedRatio: 0,
      },
      "6": {
        BreakDamageAddedRatioBase: 0,
        SPRatioBase: 0,
        HPAddedRatio: 0,
        AttackAddedRatio: 0,
        DefenceAddedRatio: 0,
      },
    },
    subWeight: {
      HPDelta: 0,
      AttackDelta: 0,
      DefenceDelta: 0,
      HPAddedRatio: 0,
      AttackAddedRatio: 0,
      DefenceAddedRatio: 0,
      SpeedDelta: 0,
      CriticalChanceBase: 0,
      CriticalDamageBase: 0,
      StatusProbabilityBase: 0,
      StatusResistanceBase: 0,
      BreakDamageAddedRatioBase: 0,
    },
    subMax: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 },
  };
}

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), "utf-8")) as T;
}

/** 四舍五入到指定小数位 */
function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** 把单角色的属性价值行展开成 mainWeight（部位 3~6） */
function fillMainWeight(
  config: ScoreConfigItem,
  mainRow: AffixValueRow,
  damageType: string,
): void {
  const g = (k: keyof AffixValueRow): number => Number(mainRow[k] ?? 0);

  config.mainWeight["3"] = {
    HPAddedRatio: g("HP"),
    AttackAddedRatio: g("Attack"),
    DefenceAddedRatio: g("Defence"),
    CriticalChanceBase: g("CriticalChance"),
    CriticalDamageBase: g("CriticalDamage"),
    HealRatioBase: g("HealRatio"),
    StatusProbabilityBase: g("StatusProbability"),
  };
  config.mainWeight["4"] = {
    HPAddedRatio: g("HP"),
    AttackAddedRatio: g("Attack"),
    DefenceAddedRatio: g("Defence"),
    SpeedDelta: g("Speed"),
  };
  const sphereKey = DAMAGE_TYPE_TO_SPHERE[damageType];
  const sphere: Record<string, number> = {
    HPAddedRatio: g("HP"),
    AttackAddedRatio: g("Attack"),
    DefenceAddedRatio: g("Defence"),
    PhysicalAddedRatio: 0,
    FireAddedRatio: 0,
    IceAddedRatio: 0,
    ThunderAddedRatio: 0,
    WindAddedRatio: 0,
    QuantumAddedRatio: 0,
    ImaginaryAddedRatio: 0,
  };
  if (sphereKey) sphere[sphereKey] = g("DamageAddedRatio");
  config.mainWeight["5"] = sphere;
  config.mainWeight["6"] = {
    BreakDamageAddedRatioBase: g("BreakDamage"),
    SPRatioBase: g("SPRatio"),
    HPAddedRatio: g("HP"),
    AttackAddedRatio: g("Attack"),
    DefenceAddedRatio: g("Defence"),
  };

  // 每个部位若最高值不为 1，则把最高值归一到 1
  for (const part of ["3", "4", "5", "6"] as PartId[]) {
    const vals = Object.values(config.mainWeight[part]);
    if (vals.every((v) => v !== 1)) {
      const highest = Math.max(...vals);
      for (const key of Object.keys(config.mainWeight[part])) {
        if (config.mainWeight[part][key] === highest) {
          config.mainWeight[part][key] = 1;
        }
      }
    }
  }

  // 攻击与伤害加成的修正：兼具高伤害与高攻击时，球上攻击词条价值取两者较大
  const damageAdd = g("DamageAddedRatio");
  const attackAdd = g("Attack");
  if (damageAdd > 0.1 && attackAdd > 0.1) {
    config.mainWeight["5"].AttackAddedRatio = Math.max(
      Math.min(1, round(damageAdd * 0.8, 1)),
      attackAdd,
    );
  }
}

/** 把单角色的属性价值行展开成 subWeight（副词条价值表） */
function fillSubWeight(config: ScoreConfigItem, subRow: AffixValueRow): void {
  const g = (k: keyof AffixValueRow): number => Number(subRow[k] ?? 0);
  // 绝对值词条（Delta）单次升级幅度小，价值除以 3 后取整再降权
  const delta = (v: number): number => (v > 0.1 ? round(v / 3, 1) : 0);
  config.subWeight = {
    HPDelta: delta(g("HP")),
    AttackDelta: delta(g("Attack")),
    DefenceDelta: delta(g("Defence")),
    HPAddedRatio: g("HP"),
    AttackAddedRatio: g("Attack"),
    DefenceAddedRatio: g("Defence"),
    SpeedDelta: g("Speed"),
    CriticalChanceBase: g("CriticalChance"),
    CriticalDamageBase: g("CriticalDamage"),
    StatusProbabilityBase: g("StatusProbability"),
    StatusResistanceBase: g("StatusResistance"),
    BreakDamageAddedRatioBase: g("BreakDamage"),
  };
}

/**
 * 计算 subMax：每部位的副词条理论上限（评分分母）。
 *
 * 思路：排除该部位会占用的主词条方向后，取价值最高的 4 个副词条，按难度乘数加权。
 * - 头/手（1,2）：主词条固定不占副词条池，乘数 [6,1,1,1]
 * - 身/脚/球/绳（3~6）：最优主词条占掉一个方向，乘数 [5,1,1,1]
 */
function computeSubMax(config: ScoreConfigItem): void {
  const orderedSub = Object.entries(config.subWeight).sort(
    (a, b) => b[1] - a[1],
  );

  for (const part of PART_IDS) {
    let excluded: string | null = null;
    if (part === "1") excluded = "HPDelta";
    else if (part === "2") excluded = "AttackDelta";
    else {
      const orderedMain = Object.entries(config.mainWeight[part]).sort(
        (a, b) => b[1] - a[1],
      );
      const bestMain = orderedMain[0]?.[0];
      if (bestMain && bestMain in config.subWeight) excluded = bestMain;
    }

    const top: number[] = [];
    for (const [key, w] of orderedSub) {
      if (key !== excluded) top.push(w);
      if (top.length === 4) break;
    }
    while (top.length < 4) top.push(0);

    const mult = part === "1" || part === "2" ? [6, 1, 1, 1] : [5, 1, 1, 1];
    const score =
      top[0] * mult[0] + top[1] * mult[1] + top[2] * mult[2] + top[3] * mult[3];
    config.subMax[part] = round(score, 3);
  }
}

/** 主流程：读取 data/ 生成 ScoreMap */
export function generateScoreMap(): ScoreMap {
  const avatars = readJson<AvatarConfig[]>("raw/avatarConfig.json");
  const mainValues = readJson<AffixValueRow[]>("mainAffixValues.json");
  const subValues = readJson<AffixValueRow[]>("subAffixValues.json");

  const byId = <T extends { AvatarID: number }>(
    arr: T[],
    id: string,
  ): T | undefined => arr.find((i) => String(i.AvatarID) === id);

  const scoreMap: ScoreMap = {};

  for (const avatar of avatars) {
    const id = avatar.id;
    const config = makeInitConfig();

    const mainRow = byId(mainValues, id);
    if (mainRow) fillMainWeight(config, mainRow, avatar.damageType);

    const subRow = byId(subValues, id);
    if (subRow) fillSubWeight(config, subRow);

    computeSubMax(config);

    scoreMap[id] = config;
  }

  // 按 id 排序输出，diff 友好
  const sorted: ScoreMap = {};
  for (const key of Object.keys(scoreMap).sort()) sorted[key] = scoreMap[key];
  return sorted;
}

/** CLI：生成并写入仓库根的 score.json */
function main(): void {
  const scoreMap = generateScoreMap();
  const outPath = path.resolve(__dirname, "../score.json");
  fs.writeFileSync(outPath, JSON.stringify(scoreMap, null, 4) + "\n", "utf-8");
  console.log(
    `score.json 已生成：${Object.keys(scoreMap).length} 个角色 -> ${outPath}`,
  );
}

if (require.main === module) main();
