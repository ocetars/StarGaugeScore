import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { generateScoreMap } from "../src/generate";
import { scoreRelic, scoreCharacter } from "../src/score";
import type { RelicInput, ScoreConfigItem, ScoreMap } from "../src/types";

const ROOT = path.resolve(__dirname, "..");
const committed: ScoreMap = JSON.parse(
  fs.readFileSync(path.join(ROOT, "score.json"), "utf-8"),
);

describe("生成对齐（金样本①）", () => {
  it("generateScoreMap 输出与已提交的 score.json 完全一致", () => {
    const fresh = generateScoreMap();
    // 逐角色逐字段比较，防止生成逻辑被无意改动
    expect(Object.keys(fresh).sort()).toEqual(Object.keys(committed).sort());
    for (const id of Object.keys(committed)) {
      expect(fresh[id], `角色 ${id} 配置漂移`).toEqual(committed[id]);
    }
  });

  it("每个角色结构完整：mainWeight 六部位 / subWeight / subMax 六部位", () => {
    for (const [id, cfg] of Object.entries(committed)) {
      for (const part of ["1", "2", "3", "4", "5", "6"]) {
        expect(
          cfg.mainWeight[part as keyof typeof cfg.mainWeight],
          `${id} 缺 mainWeight[${part}]`,
        ).toBeDefined();
        expect(
          typeof cfg.subMax[part as keyof typeof cfg.subMax],
          `${id} 缺 subMax[${part}]`,
        ).toBe("number");
      }
      expect(cfg.subWeight).toBeTruthy();
    }
  });
});

describe("参考评分器（金样本②）", () => {
  // 固定合成配置：把评分器算术与「活」的角色数据解耦——重做某角色不应撼动评分器回归。
  // 角色数据正确性由金样本①（generate 与 committed 全字段对齐）守护，这里只测算法本身。
  const fixedCfg = {
    mainWeight: {
      "1": { HPDelta: 1 },
      "2": { AttackDelta: 1 },
      "3": { CriticalDamageBase: 1 },
      "4": { HPAddedRatio: 1 },
      "5": { HPAddedRatio: 1 },
      "6": { HPAddedRatio: 1 },
    },
    subWeight: { CriticalChanceBase: 1, SpeedDelta: 0.1, HPDelta: 0.3 },
    subMax: { "1": 6.4, "2": 6.4, "3": 6.4, "4": 6.4, "5": 6.4, "6": 6.4 },
  } as unknown as ScoreConfigItem;

  it("正常身件：主词条对 + 双暴副词条", () => {
    const relic: RelicInput = {
      part: "3",
      mainType: "CriticalDamageBase",
      level: 15,
      subAffixes: [
        { type: "CriticalChanceBase", count: 5 },
        { type: "AttackAddedRatio", count: 2 }, // 攻击权重 0，应被忽略
        { type: "SpeedDelta", count: 1 },
        { type: "HPDelta", count: 1 },
      ],
    };
    const r = scoreRelic(relic, fixedCfg);
    expect(r.mainScore).toBeCloseTo(1, 10);
    expect(r.subRawScore).toBeCloseTo(5.4, 10); // 5×1 + 1×0.1 + 1×0.3
    expect(r.subScore).toBeCloseTo(5.4 / 6.4, 10); // subMax[3]=6.4
    expect(r.score).toBeCloseTo(0.8984375, 10); // 0.35×1 + 0.65×subScore
    expect(r.subDetails.find((d) => d.type === "AttackAddedRatio")).toBeUndefined();
  });

  it("副词条溢出时归一封顶到 1，满件得满分 100", () => {
    const relic: RelicInput = {
      part: "3",
      mainType: "CriticalDamageBase",
      level: 15,
      subAffixes: [{ type: "CriticalChanceBase", count: 9 }], // 9 > subMax[3]=6.4
    };
    const r = scoreRelic(relic, fixedCfg);
    expect(r.subScore).toBe(1); // 封顶
    expect(r.score).toBeCloseTo(1, 10); // 0.35 + 0.65
  });

  it("主词条错 + 副词条全无价值 → 0 分", () => {
    const relic: RelicInput = {
      part: "3",
      mainType: "AttackAddedRatio", // 身件攻击权重为 0
      level: 15,
      subAffixes: [{ type: "DefenceDelta", count: 6 }], // 防御小词条权重 0
    };
    const r = scoreRelic(relic, fixedCfg);
    expect(r.mainScore).toBe(0);
    expect(r.subScore).toBe(0);
    expect(r.score).toBe(0);
  });

  it("低等级主词条按 (level+1)/16 折算", () => {
    const relic: RelicInput = {
      part: "1",
      mainType: "HPDelta",
      level: 0,
      subAffixes: [],
    };
    const r = scoreRelic(relic, fixedCfg);
    expect(r.mainScore).toBeCloseTo(1 / 16, 10);
  });

  it("角色整体：缺部位按 0 计入 6 件平均", () => {
    const oneRelic: RelicInput = {
      part: "1",
      mainType: "HPDelta",
      level: 15,
      subAffixes: [{ type: "CriticalChanceBase", count: 5 }],
    };
    const c = scoreCharacter([oneRelic], fixedCfg);
    expect(c.missingParts).toEqual(["2", "3", "4", "5", "6"]);
    const single = scoreRelic(oneRelic, fixedCfg).score;
    expect(c.score).toBeCloseTo(single / 6, 10);
    expect(c.percent).toBeCloseTo(Math.round((single / 6) * 10000) / 100, 6);
  });

  it("满配 6 件理论满分 = 100", () => {
    const perfectSub = [{ type: "CriticalChanceBase", count: 9 }];
    const relics: RelicInput[] = [
      { part: "1", mainType: "HPDelta", level: 15, subAffixes: perfectSub },
      { part: "2", mainType: "AttackDelta", level: 15, subAffixes: perfectSub },
      { part: "3", mainType: "CriticalDamageBase", level: 15, subAffixes: perfectSub },
      { part: "4", mainType: "HPAddedRatio", level: 15, subAffixes: perfectSub },
      { part: "5", mainType: "HPAddedRatio", level: 15, subAffixes: perfectSub },
      { part: "6", mainType: "HPAddedRatio", level: 15, subAffixes: perfectSub },
    ];
    const c = scoreCharacter(relics, fixedCfg);
    expect(c.percent).toBe(100);
  });
});
