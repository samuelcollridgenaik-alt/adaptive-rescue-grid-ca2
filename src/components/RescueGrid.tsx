import { useMemo } from "react";
import { ACTION_ARROWS, hasPosition, positionKey, positionToState, stateToPosition } from "../engine/grid";
import type { Action, GridConfig } from "../engine/types";

export type EditTool = "inspect" | "start" | "goal" | "wall" | "hazard" | "erase";

interface RescueGridProps {
  config: GridConfig;
  activeState: number;
  selectedState: number;
  policy?: Array<Action | null>;
  route?: number[];
  showPolicy: boolean;
  editTool: EditTool;
  disabled?: boolean;
  onSelect: (state: number) => void;
  onEdit: (state: number) => void;
}

export function RescueGrid({ config, activeState, selectedState, policy, route = [], showPolicy, editTool, disabled = false, onSelect, onEdit }: RescueGridProps) {
  const routeSteps = useMemo(() => new Map(route.map((state, index) => [state, index])), [route]);
  const gridStyle = { gridTemplateColumns: `repeat(${config.width}, minmax(34px, 1fr))` };
  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-[440px] gap-1 rounded-xl bg-[#071126] p-2" style={gridStyle} role="grid" aria-label="Interactive rescue navigation grid">
        {Array.from({ length: config.width * config.height }, (_, state) => {
          const position = stateToPosition(config, state);
          const wall = hasPosition(config.walls, position);
          const hazard = hasPosition(config.hazards, position);
          const start = positionKey(position) === positionKey(config.start);
          const goal = positionKey(position) === positionKey(config.goal);
          const robot = state === activeState;
          const selected = state === selectedState;
          const routeStep = routeSteps.get(state);
          const content = wall ? "▦" : goal ? "✚" : hazard ? "⚠" : robot ? "◆" : showPolicy && policy?.[state] !== null && policy?.[state] !== undefined ? ACTION_ARROWS[policy[state] as Action] : "";
          const cellName = wall ? "blocked wall" : goal ? "rescue destination" : hazard ? "hazard" : robot ? "robot" : "open terrain";
          return (
            <button
              key={state}
              type="button"
              role="gridcell"
              aria-label={`${cellName}, coordinate ${position.x + 1}, ${position.y + 1}${routeStep !== undefined ? `, learned route step ${routeStep + 1}` : ""}`}
              disabled={disabled}
              onClick={() => {
                if (editTool === "inspect") onSelect(state);
                else onEdit(state);
              }}
              className={`relative flex aspect-square min-h-[34px] items-center justify-center rounded-md border text-base font-bold transition ${
                wall ? "border-[#406080] bg-[#24374d] text-[#89a5bd]" : goal ? "border-[#3dff9e]/70 bg-[#123d36] text-[#3dff9e]" : hazard ? "cell-hazard border-[#ff4d6d]/70 bg-[#3c1727] text-[#ff8096]" : "border-[#1e365a] bg-[#101d35] text-[#8ea2c4] hover:border-[#00e5ff]/60"
              } ${selected ? "ring-2 ring-[#00e5ff] ring-offset-1 ring-offset-[#071126]" : ""} ${robot ? "shadow-[0_0_20px_rgba(0,229,255,.42)] text-[#00e5ff]" : ""}`}
            >
              <span className={goal || robot ? "animate-beacon" : ""}>{content}</span>
              {routeStep !== undefined && !wall && !hazard && !goal && !robot && <span className="absolute right-1 top-0.5 text-[8px] font-semibold text-[#00e5ff]/70">{routeStep + 1}</span>}
              <span className="absolute bottom-0.5 left-1 text-[7px] font-medium text-[#607898]">{position.x + 1},{position.y + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
