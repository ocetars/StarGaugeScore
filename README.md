# StarGaugeScore

「星练度」的评分策略仓库——评分如何计算的**唯一真相源**。自产自销：自己维护权重、
自己生成评分配置、自己定义评分算法，新角色上线当天即可更新，不依赖第三方更新节奏。

仓库产出两样东西：

1. **`score.json`** —— 每个角色每个部位的评分配置（`mainWeight` / `subWeight` / `subMax`），后端编译时直接消费。
2. **参考评分器**（`src/score.ts`）—— 把遗器/角色折算成百分制分数的权威实现，后端据此对齐。

## 仓库内各部分关系

```
  人工维护（评分判断的核心资产）            角色基础数据（随版本更新，非判断）
  ┌─────────────────────────┐            ┌──────────────────────────────┐
  │ data/mainAffixValues.json│            │ data/raw/avatarConfig.json     │
  │ data/subAffixValues.json │            │ （id/名字/命途/伤害属性）       │
  └────────────┬─────────────┘            └───────────────┬──────────────┘
               └───────────────┬───────────────────────────┘
                               ▼
                   src/generate.ts  （展开 + 推导 subMax）
                               ▼
                        score.json  ── 后端 StarGauge-server 消费
                               │
        docs/ALGORITHM.md ─────┤  （规范）
                               ▼
                   src/score.ts  参考评分器（遗器/角色 → 百分制）
                               │
                   test/golden.test.ts  金样本：
                     ① generate 输出与 score.json 对齐
                     ② 评分器固定向量
                               ▼
                   后端实现按同一规范 + 金样本对齐
```

## 文件职责

| 路径 | 职责 | 谁维护 |
| --- | --- | --- |
| `data/mainAffixValues.json` | 每角色**主词条**价值表（属性 → 0~1） | **人工**（核心资产） |
| `data/subAffixValues.json` | 每角色**副词条**价值表（属性 → 0~1） | **人工**（核心资产） |
| `data/raw/avatarConfig.json` | 角色 id / 中文名 / 命途 / 伤害属性 | 随版本更新 |
| `src/generate.ts` | 把上述展开成 `score.json`，并推导 `subMax` | 算法代码 |
| `src/score.ts` | 参考评分器，实现 `docs/ALGORITHM.md` | 算法代码 |
| `src/types.ts` | 共享类型 | 算法代码 |
| `score.json` | 生成产物，后端消费 | 自动生成，勿手改 |
| `docs/ALGORITHM.md` | 评分合成规范（权威定义） | 文档 |
| `docs/BACKLOG.md` | 后续考虑（边际价值/IMPOSSIBLE/标定） | 文档 |
| `test/golden.test.ts` | 金样本回归 | 测试 |

## 三块原材料的含义

`score.json` 里每个角色有三样，详见 [docs/ALGORITHM.md](docs/ALGORITHM.md)：

- `mainWeight[部位][词条]`：主词条该选什么（1 最优 / 0 无价值）。
- `subWeight[词条]`：副词条值多少分（0~1）。
- `subMax[部位]`：副词条理论上限，作评分分母（由 generate 自动推导，不手填）。

部位编号：`1` 头 / `2` 手 / `3` 身 / `4` 脚 / `5` 位面球 / `6` 连结绳。

## 常用命令

```bash
npm install
npm run generate   # data/ -> score.json
npm test           # 金样本回归（生成对齐 + 评分器向量）
npm run typecheck  # 类型检查
npm run build      # 编译到 dist/（供后端按需引用）
```

## 新角色上线怎么更新

1. `data/raw/avatarConfig.json` 加一行（id / 名字 / 命途 / 伤害属性，取自游戏数据）。
2. `data/mainAffixValues.json` 与 `data/subAffixValues.json` 各加一行 —— **这是唯一需要游戏理解的人工判断**：该角色每个属性值多少分。
3. `npm run generate` 重生成 `score.json`，`npm test` 回归。
4. 把 `score.json` 同步给后端（`StarGauge-server/src/assets/score.json`），构建部署。

## 与历史 StarRailScore 的关系

生成环节（`mainWeight`/`subWeight`/`subMax`）与历史 StarRailScore 的 `generate.py` 算法一致——
金样本①即逐字段验证两者输出相同。差异只在**评分合成**（`docs/ALGORITHM.md` 的 v1：
去 sqrt + 主副 0.35/0.65），这部分由本仓库与后端共同拥有，不再依赖 StarRailScore。
