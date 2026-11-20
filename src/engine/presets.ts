import type { GridConfig, HyperParameters, Position } from "./types";

const point = (x: number, y: number): Position => ({ x, y });

export const DEFAULT_PARAMETERS: HyperParameters = {
  alpha: 0.45,
  gamma: 0.96,
  epsilonStart: 0.25,
  epsilonMin: 0.06,
  epsilonDecay: 0.012,
  episodes: 260,
  maxStepsPerEpisode: 120,
  seed: "rescue-ca2-2026",
};

export const GRID_PRESETS: Record<string, GridConfig> = {
  urban: {
    id: "urban",
    name: "Urban response corridor",
    width: 9,
    height: 7,
    start: point(0, 6),
    goal: point(8, 0),
    walls: [point(2, 0), point(2, 1), point(2, 2), point(4, 2), point(5, 2), point(6, 2), point(4, 4), point(5, 4), point(6, 4), point(7, 4)],
    hazards: [point(1, 4), point(3, 5), point(7, 1)],
    hazardMode: "terminal",
    rewards: { step: -1, wall: -3, goal: 90, hazard: -70 },
  },
  cliff: {
    id: "cliff",
    name: "Cliff-side evacuation comparison",
    width: 12,
    height: 4,
    start: point(0, 3),
    goal: point(11, 3),
    walls: [],
    hazards: Array.from({ length: 10 }, (_, index) => point(index + 1, 3)),
    hazardMode: "reset",
    rewards: { step: -1, wall: -2, goal: 100, hazard: -100 },
  },
  warehouse: {
    id: "warehouse",
    name: "Collapsed warehouse",
    width: 10,
    height: 8,
    start: point(0, 7),
    goal: point(9, 0),
    walls: [point(1, 1), point(2, 1), point(3, 1), point(6, 1), point(6, 2), point(6, 3), point(2, 3), point(3, 3), point(4, 3), point(7, 5), point(8, 5), point(2, 6), point(3, 6)],
    hazards: [point(0, 4), point(4, 5), point(5, 5), point(8, 2)],
    hazardMode: "terminal",
    rewards: { step: -1, wall: -3, goal: 100, hazard: -85 },
  },
};

export function cloneGrid(config: GridConfig): GridConfig {
  return JSON.parse(JSON.stringify(config)) as GridConfig;
}

export function presetById(id: string): GridConfig {
  return cloneGrid(GRID_PRESETS[id] ?? GRID_PRESETS.urban);
}
