import { describe, expect, it } from "vitest";
import { positionToState, transition, validateGrid } from "../src/engine/grid";
import { GRID_PRESETS, cloneGrid } from "../src/engine/presets";
import { createQTable, epsilonGreedy, setQ } from "../src/engine/qtable";
import { SeededRandom } from "../src/engine/rng";
import { extractPolicy, greedyRoute, runExperiment, tdTarget, TrainingSession, updateQValue } from "../src/engine/trainer";
import type { GridConfig, HyperParameters } from "../src/engine/types";

const params: HyperParameters = {
  alpha: 0.5,
  gamma: 0.9,
  epsilonStart: 0.15,
  epsilonMin: 0.15,
  epsilonDecay: 0,
  episodes: 50,
  maxStepsPerEpisode: 40,
  seed: "unit-seed",
};

function tinyGrid(): GridConfig {
  return {
    id: "tiny",
    name: "Tiny test grid",
    width: 3,
    height: 3,
    start: { x: 0, y: 2 },
    goal: { x: 2, y: 0 },
    walls: [{ x: 1, y: 1 }],
    hazards: [{ x: 1, y: 2 }],
    hazardMode: "terminal",
    rewards: { step: -1, wall: -2, goal: 10, hazard: -10 },
  };
}

describe("seeded randomness", () => {
  it("replays the same sequence for the same seed and differs for another seed", () => {
    const left = new SeededRandom("rescue");
    const right = new SeededRandom("rescue");
    const other = new SeededRandom("other");
    const leftValues = Array.from({ length: 8 }, () => left.next());
    expect(leftValues).toEqual(Array.from({ length: 8 }, () => right.next()));
    expect(leftValues).not.toEqual(Array.from({ length: 8 }, () => other.next()));
  });

  it("uses deterministic epsilon-greedy choices", () => {
    const q = createQTable(1);
    const first = new SeededRandom("choices");
    const second = new SeededRandom("choices");
    expect(Array.from({ length: 12 }, () => epsilonGreedy(q, 0, 1, first))).toEqual(Array.from({ length: 12 }, () => epsilonGreedy(q, 0, 1, second)));
  });
});

describe("grid transition model", () => {
  it("rejects overlapping or out-of-bounds maps", () => {
    const invalid = tinyGrid();
    invalid.goal = { x: 0, y: 2 };
    invalid.hazards.push({ x: 7, y: 7 });
    expect(validateGrid(invalid).join(" ")).toMatch(/different cells/);
    expect(validateGrid(invalid).join(" ")).toMatch(/outside/);
  });

  it("self-loops on a boundary or wall with the wall reward", () => {
    const grid = tinyGrid();
    const start = positionToState(grid, grid.start);
    const boundary = transition(grid, start, 2);
    expect(boundary).toMatchObject({ toState: start, reward: -2, terminal: false, hitWall: true });
    const wall = transition(grid, positionToState(grid, { x: 1, y: 0 }), 2);
    expect(wall).toMatchObject({ toState: positionToState(grid, { x: 1, y: 0 }), reward: -2, terminal: false, hitWall: true });
  });

  it("reports terminal goal and terminal hazard transitions", () => {
    const grid = tinyGrid();
    expect(transition(grid, positionToState(grid, { x: 1, y: 0 }), 1)).toMatchObject({ reward: 10, terminal: true, outcome: "goal" });
    expect(transition(grid, positionToState(grid, grid.start), 1)).toMatchObject({ reward: -10, terminal: true, outcome: "hazard", hitHazard: true });
  });

  it("returns to start for a reset hazard without incorrectly marking terminal", () => {
    const grid = cloneGrid(GRID_PRESETS.cliff);
    const result = transition(grid, positionToState(grid, grid.start), 1);
    expect(result).toMatchObject({ toState: positionToState(grid, grid.start), terminal: false, hitHazard: true, reward: -100 });
  });
});

describe("TD updates", () => {
  it("uses zero bootstrap for terminal SARSA and Q-Learning targets", () => {
    expect(tdTarget(10, true, 0.9, 999)).toBe(10);
    expect(updateQValue(5, tdTarget(10, true, 0.9, 999), 0.5)).toBe(7.5);
  });

  it("computes the documented non-terminal SARSA and Q-Learning updates", () => {
    const sarsaTarget = tdTarget(2, false, 0.9, 4);
    expect(updateQValue(1, sarsaTarget, 0.5)).toBeCloseTo(3.3, 10);
    const qLearningTarget = tdTarget(2, false, 0.9, 6);
    expect(updateQValue(1, qLearningTarget, 0.5)).toBeCloseTo(4.2, 10);
  });

  it("captures SARSA self-loop bootstrap before updating the current value", () => {
    const grid = tinyGrid();
    grid.start = { x: 0, y: 0 };
    grid.goal = { x: 2, y: 2 };
    grid.walls = [];
    grid.hazards = [];
    const session = new TrainingSession(grid, { ...params, epsilonStart: 0, epsilonMin: 0, episodes: 1, maxStepsPerEpisode: 1 }, "sarsa");
    const start = positionToState(grid, grid.start);
    // Up is uniquely greedy and hits the boundary. SARSA must bootstrap from its value before mutating it.
    setQ(session.q, start, 0, 4);
    setQ(session.q, start, 1, 1);
    setQ(session.q, start, 2, 1);
    setQ(session.q, start, 3, 1);
    const event = session.step();
    expect(event).not.toBeNull();
    expect(event?.bootstrap).toBe(4);
    expect(event?.newValue).toBeCloseTo(0.5 * (event!.target - 4) + 4, 10);
  });
});

describe("training sessions", () => {
  it("reproduces a full experiment exactly for a common seed", () => {
    const grid = cloneGrid(GRID_PRESETS.urban);
    const first = runExperiment(grid, params, "q-learning");
    const second = runExperiment(grid, params, "q-learning");
    expect(Array.from(first.q)).toEqual(Array.from(second.q));
    expect(first.history).toEqual(second.history);
  });

  it("keeps episode caps explicit and produces a valid policy/route", () => {
    const grid = tinyGrid();
    const result = runExperiment(grid, { ...params, episodes: 8, maxStepsPerEpisode: 2 }, "sarsa");
    expect(result.history).toHaveLength(8);
    expect(result.history.every((metric) => metric.steps <= 2)).toBe(true);
    expect(extractPolicy(grid, result.q)).toHaveLength(9);
    expect(greedyRoute(grid, result.q, 12).length).toBeLessThanOrEqual(13);
  });

  it("makes the cliff preset available as a genuine reset-hazard experiment", () => {
    const result = runExperiment(cloneGrid(GRID_PRESETS.cliff), { ...params, episodes: 15, maxStepsPerEpisode: 30 }, "q-learning");
    expect(result.history).toHaveLength(15);
    expect(result.history.every((metric) => Number.isFinite(metric.reward) && Number.isFinite(metric.steps))).toBe(true);
    expect(Array.from(result.q).some((value) => value !== 0)).toBe(true);
  });
});
