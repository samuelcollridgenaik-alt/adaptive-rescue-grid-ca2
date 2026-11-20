import { ACTION_ARROWS } from "./grid";
import type { Action } from "./types";
import { SeededRandom } from "./rng";

export const ACTIONS: Action[] = [0, 1, 2, 3];

export function createQTable(stateCount: number): Float64Array {
  return new Float64Array(stateCount * ACTIONS.length);
}

export function qIndex(state: number, action: Action): number {
  return state * ACTIONS.length + action;
}

export function getQ(q: Float64Array, state: number, action: Action): number {
  return q[qIndex(state, action)];
}

export function setQ(q: Float64Array, state: number, action: Action, value: number): void {
  q[qIndex(state, action)] = value;
}

export function valuesForState(q: Float64Array, state: number): number[] {
  return ACTIONS.map((action) => getQ(q, state, action));
}

export function maxActionValue(q: Float64Array, state: number): number {
  return Math.max(...valuesForState(q, state));
}

export function greedyActions(q: Float64Array, state: number): Action[] {
  const maximum = maxActionValue(q, state);
  return ACTIONS.filter((action) => Math.abs(getQ(q, state, action) - maximum) < 1e-12);
}

export function greedyAction(q: Float64Array, state: number, random?: SeededRandom): Action {
  const candidates = greedyActions(q, state);
  return random ? candidates[random.int(candidates.length)] : candidates[0];
}

export function epsilonGreedy(q: Float64Array, state: number, epsilon: number, random: SeededRandom): Action {
  if (random.next() < epsilon) return ACTIONS[random.int(ACTIONS.length)];
  return greedyAction(q, state, random);
}

export function readableAction(action: Action): string {
  return `${ACTION_ARROWS[action]} ${["Up", "Right", "Down", "Left"][action]}`;
}
