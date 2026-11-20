import { hasPosition, positionToState, stateToPosition, transition } from "./grid";
import { createQTable, epsilonGreedy, getQ, greedyAction, maxActionValue, setQ } from "./qtable";
import { SeededRandom } from "./rng";
import type {
  Action,
  Algorithm,
  ComparisonResult,
  EpisodeEnd,
  EpisodeMetric,
  GridConfig,
  HyperParameters,
  StepEvent,
  TrainingResult,
  TrainingSummary,
} from "./types";
import { validateGrid } from "./grid";

export function epsilonForEpisode(parameters: HyperParameters, episode: number): number {
  return Math.max(parameters.epsilonMin, parameters.epsilonStart * Math.exp(-parameters.epsilonDecay * episode));
}

export function tdTarget(reward: number, terminal: boolean, gamma: number, bootstrap: number): number {
  return terminal ? reward : reward + gamma * bootstrap;
}

export function updateQValue(oldValue: number, target: number, alpha: number): number {
  return oldValue + alpha * (target - oldValue);
}

/**
 * A one-transition-at-a-time session. It keeps the seeded generator and current
 * SARSA next action alive so an animated pause/resume produces the same run.
 */
export class TrainingSession {
  readonly q: Float64Array;
  readonly history: EpisodeMetric[] = [];
  readonly random: SeededRandom;
  private state: number;
  private action: Action | null = null;
  private currentReward = 0;
  private currentSteps = 0;
  private currentHazards = 0;
  private currentEpsilon = 0;
  private needsStart = true;
  private _complete = false;

  constructor(
    readonly config: GridConfig,
    readonly parameters: HyperParameters,
    readonly algorithm: Algorithm,
  ) {
    const errors = validateGrid(config);
    if (errors.length) throw new Error(errors.join(" "));
    this.q = createQTable(config.width * config.height);
    this.random = new SeededRandom(parameters.seed);
    this.state = positionToState(config, config.start);
  }

  get complete(): boolean {
    return this._complete;
  }

  get episode(): number {
    return this.history.length + (this.needsStart ? 0 : 1);
  }

  get currentState(): number {
    return this.state;
  }

  get epsilon(): number {
    return this.currentEpsilon;
  }

  step(): StepEvent | null {
    if (this._complete) return null;
    this.startEpisodeIfNeeded();
    if (this._complete || this.action === null) return null;

    const fromState = this.state;
    const action = this.action;
    const result = transition(this.config, fromState, action);
    const oldValue = getQ(this.q, fromState, action);
    let bootstrap = 0;
    let nextAction: Action | null = null;

    if (!result.terminal) {
      if (this.algorithm === "sarsa") {
        nextAction = epsilonGreedy(this.q, result.toState, this.currentEpsilon, this.random);
        // Capture the pre-update value. This is important for a self-loop.
        bootstrap = getQ(this.q, result.toState, nextAction);
      } else {
        bootstrap = maxActionValue(this.q, result.toState);
      }
    }

    const target = tdTarget(result.reward, result.terminal, this.parameters.gamma, bootstrap);
    const newValue = updateQValue(oldValue, target, this.parameters.alpha);
    setQ(this.q, fromState, action, newValue);

    this.currentReward += result.reward;
    this.currentSteps += 1;
    if (result.hitHazard) this.currentHazards += 1;

    let endedBy: EpisodeEnd | undefined;
    if (result.terminal) {
      endedBy = result.outcome ?? "maxSteps";
    } else if (this.currentSteps >= this.parameters.maxStepsPerEpisode) {
      endedBy = "maxSteps";
    }

    if (endedBy) {
      this.state = result.toState;
      this.finishEpisode(endedBy);
    } else {
      this.state = result.toState;
      this.action = this.algorithm === "sarsa"
        ? nextAction
        : epsilonGreedy(this.q, result.toState, this.currentEpsilon, this.random);
    }

    return {
      episode: this.history.length + (endedBy ? 0 : 1),
      fromState,
      action,
      toState: result.toState,
      reward: result.reward,
      terminal: result.terminal,
      episodeEnded: Boolean(endedBy),
      endedBy,
      oldValue,
      bootstrap,
      target,
      newValue,
      epsilon: this.currentEpsilon,
    };
  }

  runToCompletion(): TrainingResult {
    while (!this._complete) this.step();
    return this.toResult();
  }

  toResult(): TrainingResult {
    return {
      algorithm: this.algorithm,
      q: new Float64Array(this.q),
      history: [...this.history],
      policy: extractPolicy(this.config, this.q),
      route: greedyRoute(this.config, this.q),
    };
  }

  private startEpisodeIfNeeded(): void {
    if (!this.needsStart) return;
    if (this.history.length >= this.parameters.episodes) {
      this._complete = true;
      return;
    }
    this.needsStart = false;
    this.state = positionToState(this.config, this.config.start);
    this.currentReward = 0;
    this.currentSteps = 0;
    this.currentHazards = 0;
    this.currentEpsilon = epsilonForEpisode(this.parameters, this.history.length);
    this.action = epsilonGreedy(this.q, this.state, this.currentEpsilon, this.random);
  }

  private finishEpisode(endedBy: EpisodeEnd): void {
    this.history.push({
      episode: this.history.length + 1,
      reward: this.currentReward,
      steps: this.currentSteps,
      epsilon: this.currentEpsilon,
      success: endedBy === "goal",
      hazardHits: this.currentHazards,
      endedBy,
    });
    this.action = null;
    this.needsStart = true;
    if (this.history.length >= this.parameters.episodes) this._complete = true;
  }
}

export function extractPolicy(config: GridConfig, q: Float64Array): Array<Action | null> {
  const policy: Array<Action | null> = [];
  for (let state = 0; state < config.width * config.height; state += 1) {
    const position = stateToPosition(config, state);
    if (hasPosition(config.walls, position) || hasPosition(config.hazards, position) || position.x === config.goal.x && position.y === config.goal.y) {
      policy.push(null);
    } else {
      policy.push(greedyAction(q, state));
    }
  }
  return policy;
}

export function greedyRoute(config: GridConfig, q: Float64Array, limit = config.width * config.height * 4): number[] {
  const route = [positionToState(config, config.start)];
  const seen = new Set(route);
  let current = route[0];
  for (let steps = 0; steps < limit; steps += 1) {
    const action = greedyAction(q, current);
    const next = transition(config, current, action);
    route.push(next.toState);
    if (next.terminal || seen.has(next.toState)) break;
    seen.add(next.toState);
    current = next.toState;
  }
  return route;
}

export function summarizeHistory(history: EpisodeMetric[], rollingWindow = 30): TrainingSummary {
  const episodes = history.length;
  const successes = history.filter((metric) => metric.success).length;
  const finalWindow = history.slice(Math.max(0, episodes - rollingWindow));
  const finalRollingReward = average(finalWindow.map((metric) => metric.reward));
  const finalRollingSuccessRate = average(finalWindow.map((metric) => Number(metric.success)));
  const successful = history.filter((metric) => metric.success);
  return {
    episodes,
    successes,
    successRate: episodes ? successes / episodes : 0,
    finalRollingReward,
    finalRollingSuccessRate,
    meanSteps: average(history.map((metric) => metric.steps)),
    meanSuccessfulSteps: average(successful.map((metric) => metric.steps)),
    totalHazardHits: history.reduce((total, metric) => total + metric.hazardHits, 0),
  };
}

export function rollingAverage(values: number[], window = 15): number[] {
  return values.map((_, index) => average(values.slice(Math.max(0, index - window + 1), index + 1)));
}

export function rollingSuccess(history: EpisodeMetric[], window = 15): number[] {
  return rollingAverage(history.map((metric) => Number(metric.success)), window);
}

export function runExperiment(config: GridConfig, parameters: HyperParameters, algorithm: Algorithm): TrainingResult {
  return new TrainingSession(config, parameters, algorithm).runToCompletion();
}

export function runFairComparison(config: GridConfig, parameters: HyperParameters): ComparisonResult {
  const sarsa = runExperiment(config, parameters, "sarsa");
  const qLearning = runExperiment(config, parameters, "q-learning");
  return {
    sarsa,
    qLearning,
    sarsaSummary: summarizeHistory(sarsa.history),
    qLearningSummary: summarizeHistory(qLearning.history),
    config,
    params: parameters,
  };
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}
