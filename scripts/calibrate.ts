/**
 * 评级阈值校准（一次性脚本，不纳入构建）
 *
 * 读取 prod 导出的遗器数据，用参考评分器按 v1 算法重算每个角色的百分制分，
 * 汇总成全体分布，按现有评级的目标分位给出新的 minScore 阈值。
 *
 * 用法：npx tsx scripts/calibrate.ts /tmp/prod_relics.jsonl
 */
import fs from "fs";
import { scoreCharacter } from "../src/score";
import type { RelicInput, ScoreConfigItem, ScoreMap, PartId } from "../src/types";
import scoreMapRaw from "../score.json";

const scoreMap = scoreMapRaw as unknown as ScoreMap;

// 现有评级 -> 目标分位（minScore 取该分位处的分数）
const GRADES: Array<{ grade: string; quantile: number }> = [
  { grade: "IMPOSSIBLE", quantile: 0.99 },
  { grade: "GODLIKE", quantile: 0.9 },
  { grade: "ACE", quantile: 0.75 },
  { grade: "SSS", quantile: 0.6 },
  { grade: "SS", quantile: 0.45 },
  { grade: "S", quantile: 0.3 },
  { grade: "A", quantile: 0.16 },
  { grade: "B", quantile: 0.06 },
  { grade: "ZERO", quantile: 0.0 },
];

function toRelicInputs(relics: any[]): RelicInput[] {
  if (!Array.isArray(relics)) return [];
  const out: RelicInput[] = [];
  for (const r of relics) {
    const part = String(r?.type ?? "") as PartId;
    if (!["1", "2", "3", "4", "5", "6"].includes(part)) continue;
    out.push({
      part,
      mainType: String(r?.main_affix?.type ?? ""),
      level: Number(r?.level ?? 0),
      subAffixes: Array.isArray(r?.sub_affix)
        ? r.sub_affix.map((s: any) => ({
            type: String(s?.type ?? ""),
            count: Number(s?.count ?? 0),
          }))
        : [],
    });
  }
  return out;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  if (q <= 0) return sorted[0];
  if (q >= 1) return sorted[sorted.length - 1];
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function main(): void {
  const file = process.argv[2] || "/tmp/prod_relics.jsonl";
  const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);

  const percents: number[] = [];
  let noConfig = 0;
  let parseFail = 0;
  let emptyRelics = 0;
  for (const line of lines) {
    let row: any;
    try {
      row = JSON.parse(line);
    } catch {
      parseFail++;
      continue;
    }
    const cfg = scoreMap[String(row.cid)] as ScoreConfigItem | undefined;
    // 无配置：生产中该角色返回 null、不计入评级人群，排除
    if (!cfg) {
      noConfig++;
      continue;
    }
    const relics = toRelicInputs(row.relics);
    // 无遗器：生产中算 0 分，计入分布
    if (!relics.length) emptyRelics++;
    percents.push(scoreCharacter(relics, cfg).percent);
  }

  percents.sort((a, b) => a - b);
  const n = percents.length;
  console.log(
    `样本数: ${n}（无配置排除 ${noConfig}，其中无遗器计 0 分 ${emptyRelics}，解析失败 ${parseFail}）`,
  );
  console.log(
    `分布: min=${percents[0].toFixed(2)} p25=${quantile(percents, 0.25).toFixed(2)} ` +
      `p50=${quantile(percents, 0.5).toFixed(2)} p75=${quantile(percents, 0.75).toFixed(2)} ` +
      `p90=${quantile(percents, 0.9).toFixed(2)} p99=${quantile(percents, 0.99).toFixed(2)} ` +
      `max=${percents[n - 1].toFixed(2)}`,
  );
  console.log("\n按现有分位重标定的阈值：");
  for (const { grade, quantile: q } of GRADES) {
    const v = quantile(percents, q);
    console.log(`  ${grade.padEnd(11)} q${q}  minScore=${v.toFixed(2)}`);
  }
}

main();
