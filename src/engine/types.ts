export type Algorithm = "sarsa" | "q-learning";
export type Action = 0 | 1 | 2 | 3;
export type HazardMode = "terminal" | "reset";
export type EpisodeEnd = "goal" | "hazard" | "maxSteps";

export interface Position {
  x: number;
  y: number;
}

export interface RewardScheme {
  step: number;
  wall: number;
  goal: number;
  hazard: number;
}

export interface GridConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  start: Position;
  goal: Position;
  walls: Position[];
  hazards: Position[];
  hazardMode: HazardMode;
  rewards: RewardScheme;
}

export interface HyperParameters {
  alpha: number;
  gamma: number;
  epsilonStart: number;
  epsilonMin: number;
  epsilonDecay: number;
  episodes: number;
  maxStepsPerEpisode: number;
  seed: string | number;
}

export interface Transition {
  fromState: number;
  action: Action;
  toState: number;
  reward: number;
  terminal: boolean;
  outcome?: "goal" | "hazard";
  hitWall: boolean;
  hitHazard: boolean;
}

export interface EpisodeMetric {
  episode: number;
  reward: number;
  steps: number;
  epsilon: number;
  success: boolean;
  hazardHits: number;
  endedBy: EpisodeEnd;
}

export interface StepEvent {
  episode: number;
  fromState: number;
  action: Action;
  toState: number;
  reward: number;
  terminal: boolean;
  episodeEnded: boolean;
  endedBy?: EpisodeEnd;
  oldValue: number;
  bootstrap: number;
  target: number;
  newValue: number;
  epsilon: number;
}

export interface TrainingResult {
  algorithm: Algorithm;
  q: Float64Array;
  history: EpisodeMetric[];
  policy: Array<Action | null>;
  route: number[];
}

export interface TrainingSummary {
  episodes: number;
  successes: number;
  successRate: number;
  finalRollingReward: number;
  finalRollingSuccessRate: number;
  meanSteps: number;
  meanSuccessfulSteps: number;
  totalHazardHits: number;
}

export interface ComparisonResult {
  sarsa: TrainingResult;
  qLearning: TrainingResult;
  sarsaSummary: TrainingSummary;
  qLearningSummary: TrainingSummary;
  config: GridConfig;
  params: HyperParameters;
}
