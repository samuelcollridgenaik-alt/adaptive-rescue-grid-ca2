import type { Action, GridConfig, Position, Transition } from "./types";

export const ACTION_DELTAS: Record<Action, Position> = {
  0: { x: 0, y: -1 },
  1: { x: 1, y: 0 },
  2: { x: 0, y: 1 },
  3: { x: -1, y: 0 },
};

export const ACTION_LABELS: Record<Action, string> = {
  0: "Up",
  1: "Right",
  2: "Down",
  3: "Left",
};

export const ACTION_ARROWS: Record<Action, string> = {
  0: "↑",
  1: "→",
  2: "↓",
  3: "←",
};

export function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

export function samePosition(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y;
}

export function inBounds(config: GridConfig, position: Position): boolean {
  return position.x >= 0 && position.x < config.width && position.y >= 0 && position.y < config.height;
}

export function positionToState(config: GridConfig, position: Position): number {
  return position.y * config.width + position.x;
}

export function stateToPosition(config: GridConfig, state: number): Position {
  return { x: state % config.width, y: Math.floor(state / config.width) };
}

export function hasPosition(positions: Position[], position: Position): boolean {
  return positions.some((candidate) => samePosition(candidate, position));
}

export function validateGrid(config: GridConfig): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(config.width) || !Number.isInteger(config.height) || config.width < 3 || config.height < 3) {
    errors.push("Grid dimensions must be whole numbers of at least 3 × 3.");
  }
  const entities: Array<[string, Position]> = [["robot start", config.start], ["rescue destination", config.goal]];
  config.walls.forEach((position) => entities.push(["wall", position]));
  config.hazards.forEach((position) => entities.push(["hazard", position]));
  for (const [name, position] of entities) {
    if (!inBounds(config, position)) errors.push(`${name} at ${positionKey(position)} is outside the grid.`);
  }
  if (samePosition(config.start, config.goal)) errors.push("Robot start and rescue destination must be different cells.");
  const seen = new Map<string, string>();
  for (const [name, position] of entities) {
    const key = positionKey(position);
    const existing = seen.get(key);
    if (existing) errors.push(`${name} overlaps ${existing} at ${key}.`);
    else seen.set(key, name);
  }
  return errors;
}

export function transition(config: GridConfig, fromState: number, action: Action): Transition {
  const from = stateToPosition(config, fromState);
  const delta = ACTION_DELTAS[action];
  const candidate = { x: from.x + delta.x, y: from.y + delta.y };
  if (!inBounds(config, candidate) || hasPosition(config.walls, candidate)) {
    return { fromState, action, toState: fromState, reward: config.rewards.wall, terminal: false, hitWall: true, hitHazard: false };
  }
  const toState = positionToState(config, candidate);
  if (samePosition(candidate, config.goal)) {
    return { fromState, action, toState, reward: config.rewards.goal, terminal: true, outcome: "goal", hitWall: false, hitHazard: false };
  }
  if (hasPosition(config.hazards, candidate)) {
    if (config.hazardMode === "terminal") {
      return { fromState, action, toState, reward: config.rewards.hazard, terminal: true, outcome: "hazard", hitWall: false, hitHazard: true };
    }
    return {
      fromState,
      action,
      toState: positionToState(config, config.start),
      reward: config.rewards.hazard,
      terminal: false,
      hitWall: false,
      hitHazard: true,
    };
  }
  return { fromState, action, toState, reward: config.rewards.step, terminal: false, hitWall: false, hitHazard: false };
}
