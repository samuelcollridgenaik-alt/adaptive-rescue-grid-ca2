import fs from "node:fs/promises";
import path from "node:path";
import { cloneGrid, GRID_PRESETS } from "../src/engine/presets";
import { rollingAverage, rollingSuccess, runExperiment, summarizeHistory } from "../src/engine/trainer";
import type { Algorithm, EpisodeMetric, HyperParameters, TrainingResult } from "../src/engine/types";

const workspace = process.cwd();
const outputPath = path.join(workspace, "presentation", "experiment-results.json");
const seeds = ["CA2-cliff-01", "CA2-cliff-02", "CA2-cliff-03", "CA2-cliff-04", "CA2-cliff-05"];
const parameters: HyperParameters = {
  alpha: 0.5,
  gamma: 1,
  epsilonStart: 0.1,
  epsilonMin: 0.1,
  epsilonDecay: 0,
  episodes: 300,
  maxStepsPerEpisode: 160,
  seed: seeds[0],
};

interface Aggregate {
  algorithm: Algorithm;
  rewardsByEpisode: number[];
  stepsByEpisode: number[];
  rollingReward: number[];
  rollingSuccessPercent: number[];
  finalRollingReward: Stat;
  finalWindowSuccessPercent: Stat;
  meanSteps: Stat;
  meanSuccessfulSteps: Stat;
  hazardHits: Stat;
  totalGoals: Stat;
  displayRun: {
    seed: string;
    route: number[];
    policy: Array<number | null>;
    history: EpisodeMetric[];
  };
}

interface Stat { mean: number; standardDeviation: number; }

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function stat(values: number[]): Stat {
  const average = mean(values);
  return { mean: average, standardDeviation: Math.sqrt(mean(values.map((value) => (value - average) ** 2))) };
}

function meanSeries(runs: TrainingResult[], select: (history: EpisodeMetric[]) => number[]): number[] {
  return Array.from({ length: parameters.episodes }, (_, episode) => mean(runs.map((run) => select(run.history)[episode])));
}

function aggregate(algorithm: Algorithm, runs: TrainingResult[]): Aggregate {
  const summaries = runs.map((run) => summarizeHistory(run.history));
  const reward = meanSeries(runs, (history) => history.map((metric) => metric.reward));
  const steps = meanSeries(runs, (history) => history.map((metric) => metric.steps));
  const success = meanSeries(runs, (history) => history.map((metric) => Number(metric.success)));
  return {
    algorithm,
    rewardsByEpisode: reward,
    stepsByEpisode: steps,
    rollingReward: rollingAverage(reward, 20),
    rollingSuccessPercent: rollingAverage(success, 20).map((value) => value * 100),
    finalRollingReward: stat(summaries.map((summary) => summary.finalRollingReward)),
    finalWindowSuccessPercent: stat(summaries.map((summary) => summary.finalRollingSuccessRate * 100)),
    meanSteps: stat(summaries.map((summary) => summary.meanSteps)),
    meanSuccessfulSteps: stat(summaries.map((summary) => summary.meanSuccessfulSteps)),
    hazardHits: stat(summaries.map((summary) => summary.totalHazardHits)),
    totalGoals: stat(summaries.map((summary) => summary.successes)),
    displayRun: { seed: seeds[0], route: runs[0].route, policy: runs[0].policy, history: runs[0].history },
  };
}

async function main(): Promise<void> {
  const config = cloneGrid(GRID_PRESETS.cliff);
  const sarsaRuns = seeds.map((seed) => runExperiment(config, { ...parameters, seed }, "sarsa"));
  const qLearningRuns = seeds.map((seed) => runExperiment(config, { ...parameters, seed }, "q-learning"));
  const result = {
    generatedAt: new Date().toISOString(),
    implementation: "Adaptive Rescue Grid tabular engine (seeded SARSA and Q-Learning)",
    protocol: {
      independentRuns: seeds.length,
      seeds,
      map: config,
      hyperparameters: parameters,
      metrics: ["mean episode reward", "steps per episode", "20-episode rolling success rate", "hazard entries", "greedy policy route"],
      fairness: "Each algorithm starts with a fresh zero Q-table and uses the same matched seed list, map, rewards, episode cap and hyperparameters.",
    },
    sarsa: aggregate("sarsa", sarsaRuns),
    qLearning: aggregate("q-learning", qLearningRuns),
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`Generated actual experiment data at ${path.relative(workspace, outputPath)}`);
  console.log(`SARSA final rolling reward: ${result.sarsa.finalRollingReward.mean.toFixed(2)} ± ${result.sarsa.finalRollingReward.standardDeviation.toFixed(2)}`);
  console.log(`Q-Learning final rolling reward: ${result.qLearning.finalRollingReward.mean.toFixed(2)} ± ${result.qLearning.finalRollingReward.standardDeviation.toFixed(2)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
