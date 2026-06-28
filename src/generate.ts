/**
 * 评分配置生成器
 *
 * 把人工维护的属性价值表（mainAffixValues / subAffixValues）+ 游戏数据
 * （avatarConfig / avatarRelicRecommend）展开成后端消费的 score.json
 * （每角色 main / weight / maxV2）。
 *
 * 算法与历史 StarRailScore 的 generate.py 一致，保证产物对齐；差异只在
 * 「评分合成」环节（见 src/score.ts 与 docs/ALGORITHM.md），生成环节不变。
 */
import fs from "fs";
import path from "path";
import {
  AffixValueRow,
  AvatarConfig,
  AvatarRelicRecommend,
  MainMap,
  PartId,
  ScoreConfigItem,
  ScoreMap,
  WeightMap,
} from "./types";

const DATA_DIR = path.resolve(__dirname, "../data");

const PART_IDS: PartId[] = ["1", "2", "3", "4", "5", "6"];

// 游戏部位字符串 -> 部位编号
const TYPE_MAP: Record<string, PartId> = {
  HEAD: "1",
  HAND: "2",
  BODY: "3",
  FOOT: "4",
  NECK: "5",
  OBJECT: "6",
};

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

/** 每个角色配置的初始骨架（与历史 init_data 同形） */
function makeInitConfig(): ScoreConfigItem {
  return {
    main: {
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
    weight: {
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
    max: 0,
    maxV2: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 },
  };
}

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), "utf-8")) as T;
}

/** Python round（四舍五入到指定小数位，与 generate.py 行为一致即可） */
function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** 把单角色的属性价值行展开成 main（部位 3~6） */
function fillMainFromValues(
  config: ScoreConfigItem,
  mainRow: AffixValueRow,
  damageType: string,
): void {
  const g = (k: keyof AffixValueRow): number => Number(mainRow[k] ?? 0);

  config.main["3"] = {
    HPAddedRatio: g("HP"),
    AttackAddedRatio: g("Attack"),
    DefenceAddedRatio: g("Defence"),
    CriticalChanceBase: g("CriticalChance"),
    CriticalDamageBase: g("CriticalDamage"),
    HealRatioBase: g("HealRatio"),
    // 历史实现此处取 HP（沿用，保证产物对齐）
    StatusProbabilityBase: g("HP"),
  };
  config.main["4"] = {
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
  config.main["5"] = sphere;
  config.main["6"] = {
    BreakDamageAddedRatioBase: g("BreakDamage"),
    SPRatioBase: g("SPRatio"),
    HPAddedRatio: g("HP"),
    AttackAddedRatio: g("Attack"),
    DefenceAddedRatio: g("Defence"),
  };

  // 每个部位若最高值不为 1，则把最高值归一到 1
  for (const part of ["3", "4", "5", "6"] as PartId[]) {
    const vals = Object.values(config.main[part]);
    if (vals.every((v) => v !== 1)) {
      const highest = Math.max(...vals);
      for (const key of Object.keys(config.main[part])) {
        if (config.main[part][key] === highest) config.main[part][key] = 1;
      }
    }
  }

  // 攻击与伤害加成的修正：兼具高伤害与高攻击时，球上攻击词条价值取两者较大
  const damageAdd = g("DamageAddedRatio");
  const attackAdd = g("Attack");
  if (damageAdd > 0.1 && attackAdd > 0.1) {
    config.main["5"].AttackAddedRatio = Math.max(
      Math.min(1, round(damageAdd * 0.8, 1)),
      attackAdd,
    );
  }
}

/** 把单角色的属性价值行展开成 weight（副词条价值表） */
function fillWeightFromValues(
  config: ScoreConfigItem,
  subRow: AffixValueRow,
): void {
  const g = (k: keyof AffixValueRow): number => Number(subRow[k] ?? 0);
  // 绝对值词条（Delta）单次升级幅度小，价值除以 3 后取整再降权
  const delta = (v: number): number => (v > 0.1 ? round(v / 3, 1) : 0);
  config.weight = {
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
 * 计算 maxV2：每部位的副词条理论上限。
 *
 * 思路：排除该部位会占用的主词条方向后，取价值最高的 4 个副词条，按难度乘数加权。
 * - 头/手（1,2）：主词条固定不占副词条池，乘数 [6,1,1,1]
 * - 身/脚/球/绳（3~6）：最优主词条占掉一个方向，乘数 [5,1,1,1]
 */
function computeMaxV2(config: ScoreConfigItem): void {
  const orderedSub = Object.entries(config.weight).sort((a, b) => b[1] - a[1]);

  for (const part of PART_IDS) {
    let excluded: string | null = null;
    if (part === "1") excluded = "HPDelta";
    else if (part === "2") excluded = "AttackDelta";
    else {
      const orderedMain = Object.entries(config.main[part]).sort(
        (a, b) => b[1] - a[1],
      );
      const bestMain = orderedMain[0]?.[0];
      if (bestMain && bestMain in config.weight) excluded = bestMain;
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
    config.maxV2[part] = round(score, 3);
  }
}

/** 计算旧算法 max（全部位平均，保留兼容，新算法不使用） */
function computeLegacyMax(config: ScoreConfigItem): void {
  const orderedSub = Object.entries(config.weight).sort((a, b) => b[1] - a[1]);
  let sum = 0;
  for (const part of PART_IDS) {
    let excluded: string | null = null;
    if (part === "3" || part === "4" || part === "5" || part === "6") {
      const orderedMain = Object.entries(config.main[part]).sort(
        (a, b) => b[1] - a[1],
      );
      const bestMain = orderedMain[0]?.[0];
      if (bestMain && bestMain in config.weight) excluded = bestMain;
    }
    const top: number[] = [];
    for (const [key, w] of orderedSub) {
      if (key !== excluded) top.push(w);
      if (top.length === 4) break;
    }
    while (top.length < 4) top.push(0);
    sum += 1.2 * (top[0] * 6 + top[1] * 1 + top[2] * 1 + top[3] * 1);
  }
  const avg = sum / 6;
  config.max = String(avg).length > 6 ? round(avg, 3) : avg;
}

/** 主流程：读取 data/ 生成 ScoreMap */
export function generateScoreMap(): ScoreMap {
  const avatars = readJson<AvatarConfig[]>("raw/avatarConfig.json");
  const recommends = readJson<AvatarRelicRecommend[]>(
    "raw/avatarRelicRecommend.json",
  );
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

    // 推荐主词条：PropertyList 指定的部位主词条价值置 1
    const recommend = byId(recommends, id);
    if (recommend?.PropertyList) {
      for (const prop of recommend.PropertyList) {
        const part = TYPE_MAP[prop.RelicType];
        if (part) config.main[part][prop.PropertyType] = 1;
      }
    }

    // 主词条价值表展开
    const mainRow = byId(mainValues, id);
    if (mainRow) fillMainFromValues(config, mainRow, avatar.damageType);

    // 副词条价值表展开
    const subRow = byId(subValues, id);
    if (subRow) fillWeightFromValues(config, subRow);

    computeMaxV2(config);
    computeLegacyMax(config);

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
