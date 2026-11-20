import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LineChart } from "./components/LineChart";
import { RescueGrid, type EditTool } from "./components/RescueGrid";
import { ACTION_ARROWS, ACTION_LABELS, hasPosition, positionKey, positionToState, stateToPosition, transition, validateGrid } from "./engine/grid";
import { DEFAULT_PARAMETERS, GRID_PRESETS, presetById } from "./engine/presets";
import { createQTable, valuesForState } from "./engine/qtable";
import { extractPolicy, rollingAverage, rollingSuccess, runFairComparison, summarizeHistory, TrainingSession } from "./engine/trainer";
import type { Action, Algorithm, ComparisonResult, GridConfig, HyperParameters, StepEvent } from "./engine/types";

type RunStatus = "idle" | "running" | "paused" | "complete" | "invalid";

const tools: Array<{ id: EditTool; label: string; icon: string; description: string }> = [
  { id: "inspect", label: "Inspect", icon: "⌖", description: "Inspect Q-values" },
  { id: "start", label: "Robot", icon: "◆", description: "Place robot start" },
  { id: "goal", label: "Rescue", icon: "✚", description: "Place rescue destination" },
  { id: "wall", label: "Wall", icon: "▦", description: "Place blocked terrain" },
  { id: "hazard", label: "Hazard", icon: "⚠", description: "Place hazard" },
  { id: "erase", label: "Eraser", icon: "⌫", description: "Clear wall or hazard" },
];

const speeds = [
  { label: "1×", batch: 1 },
  { label: "4×", batch: 4 },
  { label: "20×", batch: 20 },
  { label: "Max", batch: 100 },
];

function App() {
  const [grid, setGrid] = useState<GridConfig>(() => presetById("cliff"));
  const [parameters, setParameters] = useState<HyperParameters>(DEFAULT_PARAMETERS);
  const [algorithm, setAlgorithm] = useState<Algorithm>("sarsa");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [speed, setSpeed] = useState(4);
  const [history, setHistory] = useState<ReturnType<TrainingSession["toResult"]>["history"]>([]);
  const [q, setQ] = useState<Float64Array>(() => createQTable(48));
  const [policy, setPolicy] = useState<ReturnType<typeof extractPolicy>>([]);
  const [learnedRoute, setLearnedRoute] = useState<number[]>([]);
  const [activeState, setActiveState] = useState(() => positionToState(presetById("cliff"), presetById("cliff").start));
  const [selectedState, setSelectedState] = useState(0);
  const [editTool, setEditTool] = useState<EditTool>("inspect");
  const [showPolicy, setShowPolicy] = useState(true);
  const [lastEvent, setLastEvent] = useState<StepEvent | null>(null);
  const [notice, setNotice] = useState("Scenario loaded. Configure the mission or start a seeded training run.");
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [manualPath, setManualPath] = useState<number[]>(() => [positionToState(presetById("cliff"), presetById("cliff").start)]);
  const [manualEnded, setManualEnded] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const sessionRef = useRef<TrainingSession | null>(null);
  const replayTimer = useRef<number | null>(null);

  const validationErrors = useMemo(() => validateGrid(grid), [grid]);
  const selectedPosition = stateToPosition(grid, Math.min(selectedState, grid.width * grid.height - 1));
  const selectedValues = q.length === grid.width * grid.height * 4 ? valuesForState(q, Math.min(selectedState, grid.width * grid.height - 1)) : [0, 0, 0, 0];
  const currentSummary = useMemo(() => summarizeHistory(history), [history]);
  const rewardTrend = useMemo(() => rollingAverage(history.map((metric) => metric.reward), 15), [history]);
  const stepsTrend = useMemo(() => history.map((metric) => metric.steps), [history]);
  const successTrend = useMemo(() => rollingSuccess(history, 15).map((value) => value * 100), [history]);
  const comparisonNote = grid.id === "cliff"
    ? "The cliff-side map keeps exploratory risk active. Compare observed routes and metrics rather than assuming a universal winner."
    : "Both methods start from fresh Q-tables with the same map, seed and hyperparameters.";

  const resetRun = useCallback((message = "Training reset. The map remains ready for a new reproducible run.") => {
    sessionRef.current = null;
    setRunStatus(validationErrors.length ? "invalid" : "idle");
    setHistory([]);
    setQ(createQTable(grid.width * grid.height));
    setPolicy([]);
    setLearnedRoute([]);
    const initial = positionToState(grid, grid.start);
    setActiveState(initial);
    setSelectedState(initial);
    setManualPath([initial]);
    setManualEnded(false);
    setLastEvent(null);
    setComparison(null);
    setNotice(message);
  }, [grid, validationErrors.length]);

  const syncSession = useCallback((session: TrainingSession, event: StepEvent | null) => {
    setHistory([...session.history]);
    setQ(new Float64Array(session.q));
    setPolicy(extractPolicy(session.config, session.q));
    setActiveState(session.currentState);
    if (event) {
      setLastEvent(event);
      const from = stateToPosition(session.config, event.fromState);
      const to = stateToPosition(session.config, event.toState);
      setNotice(event.terminal
        ? `Terminal state reached at ${to.x + 1},${to.y + 1}. Bootstrap = 0 in the TD target.`
        : `E${String(event.episode).padStart(3, "0")} · (${from.x + 1},${from.y + 1}) ${ACTION_ARROWS[event.action]} (${to.x + 1},${to.y + 1}) · reward ${event.reward}.`);
    }
    if (session.complete) {
      const result = session.toResult();
      setPolicy(result.policy);
      setLearnedRoute(result.route);
      setRunStatus("complete");
      setNotice(`Training complete after ${result.history.length} episodes. Replay the learned greedy route or run a fair comparison.`);
    }
  }, []);

  useEffect(() => {
    if (runStatus !== "running") return undefined;
    const delay = speed >= 100 ? 24 : speed >= 20 ? 48 : 120;
    const timer = window.setInterval(() => {
      const session = sessionRef.current;
      if (!session) return;
      let event: StepEvent | null = null;
      for (let index = 0; index < speed && !session.complete; index += 1) event = session.step();
      syncSession(session, event);
    }, delay);
    return () => window.clearInterval(timer);
  }, [runStatus, speed, syncSession]);

  useEffect(() => () => {
    if (replayTimer.current) window.clearInterval(replayTimer.current);
  }, []);

  const startTraining = () => {
    const errors = validateGrid(grid);
    if (errors.length) {
      setRunStatus("invalid");
      setNotice(errors[0]);
      return;
    }
    if (runStatus === "paused" && sessionRef.current) {
      setRunStatus("running");
      setNotice("Training resumed with the same seed and in-progress Q-table.");
      return;
    }
    const session = new TrainingSession(grid, parameters, algorithm);
    sessionRef.current = session;
    setHistory([]);
    setQ(new Float64Array(session.q));
    setPolicy(extractPolicy(grid, session.q));
    setLearnedRoute([]);
    setLastEvent(null);
    setComparison(null);
    setActiveState(positionToState(grid, grid.start));
    setRunStatus("running");
    setNotice(`${algorithm === "sarsa" ? "SARSA" : "Q-Learning"} started with seed “${parameters.seed}”.`);
  };

  const pauseTraining = () => {
    setRunStatus("paused");
    setNotice("Training paused. The next action and RNG state are preserved for an exact resume.");
  };

  const runComparison = () => {
    if (runStatus === "running") return;
    const errors = validateGrid(grid);
    if (errors.length) {
      setRunStatus("invalid");
      setNotice(errors[0]);
      return;
    }
    const result = runFairComparison(grid, parameters);
    setComparison(result);
    setNotice(`Fair comparison complete: both algorithms used the same “${parameters.seed}” seed, map and hyperparameters.`);
  };

  const resetManual = () => {
    const initial = positionToState(grid, grid.start);
    setActiveState(initial);
    setManualPath([initial]);
    setManualEnded(false);
    setNotice("Manual mission reset at the robot start position.");
  };

  const moveManual = useCallback((action: Action) => {
    if (runStatus === "running" || isReplaying) return;
    if (manualEnded) {
      resetManual();
      return;
    }
    const result = transition(grid, activeState, action);
    setActiveState(result.toState);
    setManualPath((path) => [...path, result.toState]);
    if (result.terminal) {
      setManualEnded(true);
      setNotice(result.outcome === "goal" ? "Rescue destination reached manually. Mission complete." : "Manual mission entered a terminal hazard. Reset to try again.");
    } else if (result.hitHazard) {
      setNotice("Hazard encountered. This scenario returns the robot to the start, and learning receives the configured hazard penalty.");
    } else if (result.hitWall) {
      setNotice("Blocked terrain: the robot remains in place and receives the wall penalty.");
    } else {
      const position = stateToPosition(grid, result.toState);
      setNotice(`Manual move ${ACTION_LABELS[action].toLowerCase()} to ${position.x + 1},${position.y + 1}.`);
    }
  }, [activeState, grid, isReplaying, manualEnded, runStatus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      const controls: Record<string, Action> = { ArrowUp: 0, w: 0, W: 0, ArrowRight: 1, d: 1, D: 1, ArrowDown: 2, s: 2, S: 2, ArrowLeft: 3, a: 3, A: 3 };
      const action = controls[event.key];
      if (action !== undefined) {
        event.preventDefault();
        moveManual(action);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveManual]);

  const replayRoute = () => {
    if (!learnedRoute.length || runStatus === "running") return;
    if (replayTimer.current) window.clearInterval(replayTimer.current);
    setIsReplaying(true);
    let index = 0;
    setActiveState(learnedRoute[0]);
    replayTimer.current = window.setInterval(() => {
      index += 1;
      if (index >= learnedRoute.length) {
        if (replayTimer.current) window.clearInterval(replayTimer.current);
        replayTimer.current = null;
        setIsReplaying(false);
        setNotice("Learned greedy route playback complete. A loop marker means the policy did not reach the goal within the route guard.");
        return;
      }
      setActiveState(learnedRoute[index]);
    }, 240);
  };

  const changePreset = (id: string) => {
    const next = presetById(id);
    setGrid(next);
    sessionRef.current = null;
    setRunStatus("idle");
    setHistory([]);
    setQ(createQTable(next.width * next.height));
    setPolicy([]);
    setLearnedRoute([]);
    const initial = positionToState(next, next.start);
    setActiveState(initial);
    setSelectedState(initial);
    setManualPath([initial]);
    setManualEnded(false);
    setLastEvent(null);
    setComparison(null);
    setNotice(`${next.name} loaded. The cliff-side preset illustrates how on-policy and off-policy behavior can differ near risk.`);
  };

  const resizeGrid = (width: number, height: number) => {
    if (runStatus === "running") return;
    const boundedWidth = Math.max(3, Math.min(14, Math.round(width)));
    const boundedHeight = Math.max(3, Math.min(12, Math.round(height)));
    const clamp = (position: { x: number; y: number }) => ({ x: Math.min(position.x, boundedWidth - 1), y: Math.min(position.y, boundedHeight - 1) });
    const next: GridConfig = {
      ...grid,
      id: "custom",
      name: "Custom rescue map",
      width: boundedWidth,
      height: boundedHeight,
      start: clamp(grid.start),
      goal: clamp(grid.goal),
      walls: grid.walls.map(clamp).filter((position, index, all) => all.findIndex((candidate) => positionKey(candidate) === positionKey(position)) === index),
      hazards: grid.hazards.map(clamp).filter((position, index, all) => all.findIndex((candidate) => positionKey(candidate) === positionKey(position)) === index),
    };
    if (positionKey(next.start) === positionKey(next.goal)) next.goal = { x: boundedWidth - 1, y: 0 };
    next.walls = next.walls.filter((position) => positionKey(position) !== positionKey(next.start) && positionKey(position) !== positionKey(next.goal));
    next.hazards = next.hazards.filter((position) => positionKey(position) !== positionKey(next.start) && positionKey(position) !== positionKey(next.goal) && !hasPosition(next.walls, position));
    setGrid(next);
    sessionRef.current = null;
    setRunStatus("idle");
    setHistory([]);
    setQ(createQTable(next.width * next.height));
    const initial = positionToState(next, next.start);
    setActiveState(initial);
    setSelectedState(initial);
    setManualPath([initial]);
    setPolicy([]);
    setLearnedRoute([]);
    setComparison(null);
    setNotice(`Custom grid resized to ${boundedWidth} × ${boundedHeight}. Place terrain with the tool rail.`);
  };

  const editCell = (state: number) => {
    if (runStatus === "running") return;
    const position = stateToPosition(grid, state);
    const without = (items: { x: number; y: number }[]) => items.filter((item) => positionKey(item) !== positionKey(position));
    const next: GridConfig = { ...grid, id: "custom", name: "Custom rescue map", walls: [...grid.walls], hazards: [...grid.hazards] };
    if (editTool === "start") {
      if (positionKey(position) === positionKey(next.goal)) { setNotice("Robot start and rescue destination require separate cells."); return; }
      next.start = position;
      next.walls = without(next.walls);
      next.hazards = without(next.hazards);
    } else if (editTool === "goal") {
      if (positionKey(position) === positionKey(next.start)) { setNotice("Robot start and rescue destination require separate cells."); return; }
      next.goal = position;
      next.walls = without(next.walls);
      next.hazards = without(next.hazards);
    } else if (editTool === "wall") {
      if (positionKey(position) === positionKey(next.start) || positionKey(position) === positionKey(next.goal)) { setNotice("Keep the robot start and rescue destination traversable."); return; }
      next.hazards = without(next.hazards);
      if (!hasPosition(next.walls, position)) next.walls.push(position);
    } else if (editTool === "hazard") {
      if (positionKey(position) === positionKey(next.start) || positionKey(position) === positionKey(next.goal)) { setNotice("Keep the robot start and rescue destination traversable."); return; }
      next.walls = without(next.walls);
      if (!hasPosition(next.hazards, position)) next.hazards.push(position);
    } else if (editTool === "erase") {
      next.walls = without(next.walls);
      next.hazards = without(next.hazards);
    }
    setGrid(next);
    sessionRef.current = null;
    setRunStatus("idle");
    setHistory([]);
    setQ(createQTable(next.width * next.height));
    setPolicy([]);
    setLearnedRoute([]);
    const initial = positionToState(next, next.start);
    setActiveState(initial);
    setSelectedState(state);
    setManualPath([initial]);
    setManualEnded(false);
    setComparison(null);
    setNotice(`${tools.find((tool) => tool.id === editTool)?.label ?? "Map"} updated at ${position.x + 1},${position.y + 1}.`);
  };

  const updateParameter = <K extends keyof HyperParameters>(key: K, value: HyperParameters[K]) => {
    if (runStatus === "running") return;
    setParameters((current) => ({ ...current, [key]: value }));
  };

  return (
    <main className="command-grid min-h-screen px-3 pb-10 pt-3 text-[#e7f0ff] sm:px-5 lg:px-8">
      <header className="mx-auto mb-4 max-w-[1540px] rounded-2xl border border-[#1e365a] bg-[#081227]/88 px-4 py-4 shadow-signal backdrop-blur sm:px-6">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#00e5ff]/50 bg-[#00e5ff]/10 text-xl text-[#00e5ff] shadow-[0_0_24px_rgba(0,229,255,.2)]">◇</div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#00e5ff]">Presidency University · MCA Semester III · CSA4708</p>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">Adaptive Rescue Grid <span className="font-medium text-[#8ea2c4]">/ TD Learning Command Center</span></h1>
              <p className="mt-1 text-xs text-[#8ea2c4]">Module 3 · SARSA and Q-Learning from scratch · CA-2 live demonstration</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <StatusChip status={runStatus} />
            <span className="rounded-full border border-[#31547b] bg-[#101d35] px-3 py-1.5 font-mono text-[#b9ceef]">seed: {parameters.seed}</span>
            <span className="rounded-full border border-[#31547b] bg-[#101d35] px-3 py-1.5 font-medium text-[#b9ceef]">{grid.width} × {grid.height} grid</span>
          </div>
        </div>
      </header>

      <nav className="sticky top-2 z-10 mx-auto mb-4 flex max-w-[1540px] gap-2 overflow-x-auto rounded-xl border border-[#1e365a] bg-[#081227]/95 p-2 backdrop-blur md:hidden" aria-label="Mobile sections">
        {[["Mission", "mission"], ["Train", "training"], ["Analytics", "analytics"], ["Learn", "learn"]].map(([label, id]) => <a key={id} href={`#${id}`} className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-[#b9ceef] hover:bg-[#102544]">{label}</a>)}
      </nav>

      <div className="mx-auto max-w-[1540px] space-y-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[282px_minmax(500px,1fr)_330px]">
          <aside id="mission" className="panel p-4">
            <div className="mb-4 flex items-center justify-between"><h2 className="section-title">Mission setup</h2><span className="text-xs font-mono text-[#00e5ff]">MAP-01</span></div>
            <label className="mb-3 block text-xs font-medium text-[#b9ceef]">Scenario preset
              <select value={grid.id === "custom" ? "custom" : grid.id} onChange={(event) => event.target.value !== "custom" && changePreset(event.target.value)} disabled={runStatus === "running"} className="mt-1.5 w-full rounded-lg border border-[#31547b] bg-[#071126] px-3 py-2.5 text-sm text-slate-100 disabled:opacity-50">
                {Object.entries(GRID_PRESETS).map(([id, preset]) => <option key={id} value={id}>{preset.name}</option>)}
                {grid.id === "custom" && <option value="custom">Custom rescue map</option>}
              </select>
            </label>
            <p className="mb-4 text-xs leading-relaxed text-[#8ea2c4]">{grid.id === "cliff" ? "Persistent exploration beside the red hazard strip makes this a useful on-policy/off-policy comparison case." : "Edit terrain to design a rescue route, then train a fresh tabular agent."}</p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <NumberInput label="Columns" value={grid.width} min={3} max={14} disabled={runStatus === "running"} onChange={(value) => resizeGrid(value, grid.height)} />
              <NumberInput label="Rows" value={grid.height} min={3} max={12} disabled={runStatus === "running"} onChange={(value) => resizeGrid(grid.width, value)} />
            </div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7186aa]">Terrain tools</p>
            <div className="grid grid-cols-3 gap-2">
              {tools.map((tool) => <button key={tool.id} type="button" title={tool.description} disabled={runStatus === "running"} onClick={() => setEditTool(tool.id)} className={`flex min-h-16 flex-col items-center justify-center rounded-lg border px-1 text-[11px] font-medium transition disabled:opacity-40 ${editTool === tool.id ? "border-[#00e5ff] bg-[#00e5ff]/10 text-[#00e5ff]" : "border-[#284667] bg-[#101d35] text-[#b9ceef] hover:border-[#527aab]"}`}><span className="text-lg leading-5">{tool.icon}</span>{tool.label}</button>)}
            </div>
            <div className="mt-4 border-t border-[#1e365a] pt-4">
              <div className="mb-2 flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7186aa]">Manual control</p><button type="button" onClick={resetManual} className="text-xs font-medium text-[#00e5ff] hover:text-white">Reset robot</button></div>
              <p className="mb-2 text-xs text-[#8ea2c4]">Tap the pad or use WASD / arrow keys.</p>
              <div className="mx-auto grid w-36 grid-cols-3 gap-1" aria-label="Manual rescue controls">
                <span /><DPadButton action={0} onClick={moveManual} /><span />
                <DPadButton action={3} onClick={moveManual} /><span className="flex items-center justify-center text-xs text-[#7186aa]">MOVE</span><DPadButton action={1} onClick={moveManual} />
                <span /><DPadButton action={2} onClick={moveManual} /><span />
              </div>
            </div>
          </aside>

          <section className="panel min-w-0 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="section-title">Live rescue grid</h2><p className="mt-1 text-sm text-[#8ea2c4]">Select a cell to inspect its action values. Use a terrain tool to edit the map.</p></div>
              <div className="flex items-center gap-2"><button type="button" onClick={() => setShowPolicy((visible) => !visible)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${showPolicy ? "border-[#00e5ff]/60 bg-[#00e5ff]/10 text-[#00e5ff]" : "border-[#31547b] bg-[#101d35] text-[#b9ceef]"}`}>Policy arrows {showPolicy ? "on" : "off"}</button><button type="button" onClick={replayRoute} disabled={!learnedRoute.length || runStatus === "running"} className="rounded-lg border border-[#3dff9e]/50 bg-[#3dff9e]/10 px-3 py-2 text-xs font-semibold text-[#3dff9e] disabled:cursor-not-allowed disabled:opacity-40">{isReplaying ? "Replaying…" : "Replay route"}</button></div>
            </div>
            <RescueGrid config={grid} activeState={activeState} selectedState={selectedState} policy={policy} route={learnedRoute.length ? learnedRoute : manualPath} showPolicy={showPolicy} editTool={editTool} disabled={runStatus === "running" && editTool !== "inspect"} onSelect={setSelectedState} onEdit={editCell} />
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-[#1e365a] pt-3 text-xs text-[#b9ceef]">
              <Legend icon="◆" label="Robot" className="text-[#00e5ff]" /><Legend icon="✚" label="Rescue zone" className="text-[#3dff9e]" /><Legend icon="▦" label="Wall" className="text-[#89a5bd]" /><Legend icon="⚠" label={`Hazard (${grid.hazardMode})`} className="text-[#ff8096]" /><Legend icon="↑" label="Learned action" className="text-[#a78bfa]" />
            </div>
            <div className="mt-3 rounded-lg border border-[#254262] bg-[#071126] px-3 py-2 font-mono text-xs text-[#b9ceef]" aria-live="polite"><span className="mr-2 text-[#00e5ff]">EVENT</span>{notice}</div>
          </section>

          <aside id="training" className="panel p-4">
            <div className="mb-4 flex items-center justify-between"><h2 className="section-title">Learning telemetry</h2><span className="text-xs font-mono text-[#a78bfa]">TD-01</span></div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7186aa]">Algorithm</p>
            <div className="mb-4 grid grid-cols-2 rounded-xl border border-[#31547b] bg-[#071126] p-1" role="radiogroup" aria-label="Learning algorithm">
              <AlgorithmButton active={algorithm === "sarsa"} label="SARSA" caption="On-policy" color="#a78bfa" onClick={() => { setAlgorithm("sarsa"); resetRun("SARSA selected. Start a new seeded run to train."); }} />
              <AlgorithmButton active={algorithm === "q-learning"} label="Q-Learning" caption="Off-policy" color="#38bdf8" onClick={() => { setAlgorithm("q-learning"); resetRun("Q-Learning selected. Start a new seeded run to train."); }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberInput label="Episodes" value={parameters.episodes} min={10} max={2000} disabled={runStatus === "running"} onChange={(value) => updateParameter("episodes", Math.round(value))} />
              <NumberInput label="Max steps" value={parameters.maxStepsPerEpisode} min={10} max={400} disabled={runStatus === "running"} onChange={(value) => updateParameter("maxStepsPerEpisode", Math.round(value))} />
              <NumberInput label="α learning rate" value={parameters.alpha} step={0.05} min={0.01} max={1} disabled={runStatus === "running"} onChange={(value) => updateParameter("alpha", value)} />
              <NumberInput label="γ discount" value={parameters.gamma} step={0.01} min={0} max={1} disabled={runStatus === "running"} onChange={(value) => updateParameter("gamma", value)} />
              <NumberInput label="ε start" value={parameters.epsilonStart} step={0.01} min={0} max={1} disabled={runStatus === "running"} onChange={(value) => updateParameter("epsilonStart", value)} />
              <NumberInput label="ε min" value={parameters.epsilonMin} step={0.01} min={0} max={1} disabled={runStatus === "running"} onChange={(value) => updateParameter("epsilonMin", value)} />
            </div>
            <label className="mt-2 block text-xs font-medium text-[#b9ceef]">Seed
              <input value={parameters.seed} disabled={runStatus === "running"} onChange={(event) => updateParameter("seed", event.target.value)} className="mt-1 w-full rounded-lg border border-[#31547b] bg-[#071126] px-2.5 py-2 text-sm font-mono text-slate-100 disabled:opacity-50" />
            </label>
            <p className="mt-1 text-[10px] text-[#7186aa]">ε decay {parameters.epsilonDecay.toFixed(3)} per episode · seeded tie-breaking and exploration</p>
            <div className="mt-4 border-t border-[#1e365a] pt-4">
              <div className="mb-2 flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7186aa]">Training controls</p><div className="flex gap-1">{speeds.map((item) => <button type="button" key={item.batch} onClick={() => setSpeed(item.batch)} className={`rounded px-2 py-1 text-[10px] font-bold ${speed === item.batch ? "bg-[#00e5ff] text-[#04101c]" : "bg-[#101d35] text-[#8ea2c4] hover:text-white"}`}>{item.label}</button>)}</div></div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={startTraining} disabled={runStatus === "running" || isReplaying} className="rounded-lg bg-[#00e5ff] px-3 py-2.5 text-sm font-bold text-[#04101c] transition hover:bg-[#8ff4ff] disabled:cursor-not-allowed disabled:opacity-40">{runStatus === "paused" ? "Resume" : "Start training"}</button>
                <button type="button" onClick={pauseTraining} disabled={runStatus !== "running"} className="rounded-lg border border-[#ffc857]/55 bg-[#ffc857]/10 px-3 py-2.5 text-sm font-bold text-[#ffc857] disabled:cursor-not-allowed disabled:opacity-40">Pause</button>
                <button type="button" onClick={() => resetRun()} className="rounded-lg border border-[#31547b] bg-[#101d35] px-3 py-2.5 text-sm font-semibold text-[#b9ceef] hover:text-white">Reset run</button>
                <button type="button" onClick={runComparison} disabled={runStatus === "running"} className="rounded-lg border border-[#a78bfa]/55 bg-[#a78bfa]/10 px-3 py-2.5 text-sm font-semibold text-[#d8c9ff] disabled:cursor-not-allowed disabled:opacity-40">Fair compare</button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Metric label="Episode" value={`${history.length}/${parameters.episodes}`} /><Metric label="ε now" value={lastEvent ? lastEvent.epsilon.toFixed(3) : parameters.epsilonStart.toFixed(2)} /><Metric label="Last reward" value={lastEvent ? lastEvent.reward.toFixed(0) : "—"} />
            </div>
            <div className="mt-4 rounded-xl border border-[#31547b] bg-[#071126] p-3">
              <div className="mb-2 flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7186aa]">Q-table inspector</p><span className="font-mono text-xs text-[#00e5ff]">s = ({selectedPosition.x + 1},{selectedPosition.y + 1})</span></div>
              <table className="w-full border-separate border-spacing-y-1 text-xs"><thead className="text-[#7186aa]"><tr><th className="text-left font-medium">Action</th><th className="text-right font-medium">Q(s,a)</th><th className="text-right font-medium">TD</th></tr></thead><tbody>{([0, 1, 2, 3] as Action[]).map((action) => <tr key={action} className={selectedValues[action] === Math.max(...selectedValues) ? "rounded bg-[#00e5ff]/8 text-[#e7f0ff]" : "text-[#b9ceef]"}><td className="py-1">{ACTION_ARROWS[action]} {ACTION_LABELS[action]}</td><td className="py-1 text-right font-mono">{selectedValues[action].toFixed(2)}</td><td className="py-1 text-right font-mono text-[#7186aa]">{lastEvent?.fromState === selectedState && lastEvent.action === action ? (lastEvent.newValue - lastEvent.oldValue).toFixed(2) : "—"}</td></tr>)}</tbody></table>
              <p className="mt-2 text-[10px] leading-relaxed text-[#7186aa]">{lastEvent?.terminal ? "Terminal transition: target equals reward because the bootstrap value is zero." : "Best currently valued action is highlighted. Values update after every transition."}</p>
            </div>
          </aside>
        </div>

        <section id="analytics" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <LineChart title="Rolling reward · 15 episodes" data={rewardTrend} color="#00e5ff" />
          <LineChart title="Steps per episode" data={stepsTrend} color="#ffc857" />
          <LineChart title="Rolling success rate · 15 episodes" data={successTrend} color="#3dff9e" suffix="%" />
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-[#1e365a] px-4 py-4 sm:px-5"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><h2 className="section-title">Fair experiment comparison</h2><p className="mt-1 text-sm text-[#8ea2c4]">Same map · same seed · same episodes · same α / γ / ε schedule · fresh zero Q-tables</p></div><span className="w-fit rounded-full border border-[#a78bfa]/40 bg-[#a78bfa]/10 px-3 py-1 text-xs font-medium text-[#d8c9ff]">{comparison ? "RESULTS READY" : "AWAITING EXPERIMENT"}</span></div></div>
          <div className="grid grid-cols-1 divide-y divide-[#1e365a] lg:grid-cols-[1fr_1fr_1.1fr] lg:divide-x lg:divide-y-0">
            <ComparisonColumn algorithm="SARSA" hue="#a78bfa" result={comparison?.sarsaSummary} routeLength={comparison?.sarsa.route.length} />
            <ComparisonColumn algorithm="Q-Learning" hue="#38bdf8" result={comparison?.qLearningSummary} routeLength={comparison?.qLearning.route.length} />
            <div className="p-5"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#7186aa]">Reading this scenario</p><p className="text-sm leading-relaxed text-[#b9ceef]">{comparison ? comparisonNote : "Run the comparison to populate genuine outcomes. No synthetic benchmark curves appear before an experiment completes."}</p>{comparison && <div className="mt-4 rounded-lg border border-[#31547b] bg-[#071126] p-3 text-xs leading-relaxed text-[#8ea2c4]">Observed results apply only to <span className="font-semibold text-slate-100">{grid.name}</span> with seed <span className="font-mono text-[#00e5ff]">{parameters.seed}</span>. SARSA uses the next action actually selected; Q-Learning uses the greedy next-state target.</div>}</div>
          </div>
        </section>

        <section id="learn" className="panel p-4 sm:p-5">
          <div className="mb-4"><h2 className="section-title">Learning brief</h2><p className="mt-1 text-sm text-[#8ea2c4]">Theory linked directly to the controls and live update trace above.</p></div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <TheoryCard title="MDP mapping"><p><strong>State</strong> is the robot cell. <strong>Actions</strong> are up, right, down and left. The grid defines transitions, rewards and terminal rescue or hazard states.</p></TheoryCard>
            <TheoryCard title="TD learning"><p>After each move, the Q-table updates from a temporal-difference error. It learns before an episode ends, using the current estimate of what follows.</p></TheoryCard>
            <TheoryCard title="ε-greedy exploration"><p>With probability ε, the robot samples a random move. Otherwise it selects a currently best-valued move. The supplied seed makes this reproducible.</p></TheoryCard>
            <TheoryCard title="Bootstrapping"><p>The update includes a next-state value for non-terminal moves. Goal and terminal-hazard transitions use <strong>bootstrap = 0</strong>.</p></TheoryCard>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <EquationCard label="SARSA · on-policy" hue="#a78bfa" equation="Q(s,a) ← Q(s,a) + α[r + γQ(s′,a′) − Q(s,a)]" note="The target uses the next ε-greedy action actually chosen by the behavior policy." />
            <EquationCard label="Q-Learning · off-policy" hue="#38bdf8" equation="Q(s,a) ← Q(s,a) + α[r + γ maxₐ′ Q(s′,a′) − Q(s,a)]" note="The target evaluates the best-valued next action, even while behavior explores." />
          </div>
        </section>

        <footer className="px-1 pt-1 text-center text-xs text-[#7186aa]">Adaptive Rescue Grid · tabular temporal-difference learning demonstrator · inspect, train, compare and explain live</footer>
      </div>
    </main>
  );
}

function StatusChip({ status }: { status: RunStatus }) {
  const settings: Record<RunStatus, [string, string]> = { idle: ["READY", "border-[#31547b] bg-[#101d35] text-[#b9ceef]"], running: ["TRAINING", "border-[#00e5ff]/60 bg-[#00e5ff]/10 text-[#00e5ff]"], paused: ["PAUSED", "border-[#ffc857]/60 bg-[#ffc857]/10 text-[#ffc857]"], complete: ["COMPLETE", "border-[#3dff9e]/60 bg-[#3dff9e]/10 text-[#3dff9e]"], invalid: ["INVALID MAP", "border-[#ff4d6d]/60 bg-[#ff4d6d]/10 text-[#ff8096]"] };
  const [label, classes] = settings[status];
  return <span className={`rounded-full border px-3 py-1.5 text-xs font-bold tracking-wide ${classes}`}><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />{label}</span>;
}

function NumberInput({ label, value, onChange, min, max, step = 1, disabled }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number; disabled?: boolean }) {
  return <label className="block text-[11px] font-medium text-[#b9ceef]">{label}<input type="number" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(event) => { const parsed = Number(event.target.value); if (Number.isFinite(parsed)) onChange(parsed); }} className="mt-1 w-full rounded-lg border border-[#31547b] bg-[#071126] px-2.5 py-2 text-sm font-mono text-slate-100 disabled:opacity-50" /></label>;
}

function DPadButton({ action, onClick }: { action: Action; onClick: (action: Action) => void }) {
  return <button type="button" onClick={() => onClick(action)} className="flex h-10 items-center justify-center rounded-lg border border-[#31547b] bg-[#101d35] text-base text-[#b9ceef] transition hover:border-[#00e5ff] hover:text-[#00e5ff]" aria-label={`Move ${ACTION_LABELS[action]}`}>{ACTION_ARROWS[action]}</button>;
}

function AlgorithmButton({ active, label, caption, color, onClick }: { active: boolean; label: string; caption: string; color: string; onClick: () => void }) {
  return <button type="button" role="radio" aria-checked={active} onClick={onClick} className={`rounded-lg px-2 py-2 text-left transition ${active ? "bg-[#142849] shadow" : "text-[#8ea2c4] hover:text-white"}`}><span className="block text-xs font-bold" style={{ color: active ? color : undefined }}>{label}</span><span className="block text-[10px]">{caption}</span></button>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-[#284667] bg-[#071126] p-2"><p className="text-[9px] uppercase tracking-[0.12em] text-[#7186aa]">{label}</p><p className="metric-value mt-1 truncate text-sm font-bold text-slate-100">{value}</p></div>;
}

function Legend({ icon, label, className }: { icon: string; label: string; className: string }) {
  return <span className="inline-flex items-center gap-1.5"><b className={className}>{icon}</b>{label}</span>;
}

function ComparisonColumn({ algorithm, hue, result, routeLength }: { algorithm: string; hue: string; result?: ReturnType<typeof summarizeHistory>; routeLength?: number }) {
  return <div className="p-5"><div className="mb-4 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: hue, boxShadow: `0 0 12px ${hue}` }} /><h3 className="font-semibold text-white">{algorithm}</h3></div>{result ? <div className="grid grid-cols-2 gap-3 text-sm"><CompareMetric label="Success" value={`${(result.finalRollingSuccessRate * 100).toFixed(1)}%`} /><CompareMetric label="Rolling reward" value={result.finalRollingReward.toFixed(1)} /><CompareMetric label="Mean steps" value={result.meanSteps.toFixed(1)} /><CompareMetric label="Hazard entries" value={String(result.totalHazardHits)} /><CompareMetric label="Policy route" value={routeLength ? `${routeLength - 1} moves` : "—"} /><CompareMetric label="Total goals" value={`${result.successes}/${result.episodes}`} /></div> : <div className="flex min-h-28 items-center rounded-lg border border-dashed border-[#31547b] px-3 text-sm text-[#7186aa]">No results yet. Select “Fair compare” to run this method from a fresh, seeded Q-table.</div>}</div>;
}

function CompareMetric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] uppercase tracking-[0.12em] text-[#7186aa]">{label}</p><p className="metric-value mt-1 font-mono font-semibold text-[#e7f0ff]">{value}</p></div>;
}

function TheoryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <article className="rounded-xl border border-[#284667] bg-[#071126] p-4"><h3 className="mb-2 text-sm font-semibold text-[#e7f0ff]">{title}</h3><div className="text-xs leading-relaxed text-[#8ea2c4]">{children}</div></article>;
}

function EquationCard({ label, hue, equation, note }: { label: string; hue: string; equation: string; note: string }) {
  return <article className="rounded-xl border bg-[#071126] p-4" style={{ borderColor: `${hue}80` }}><h3 className="text-sm font-bold" style={{ color: hue }}>{label}</h3><p className="my-3 overflow-x-auto rounded-lg bg-[#030915] p-3 font-mono text-sm text-white">{equation}</p><p className="text-xs leading-relaxed text-[#8ea2c4]">{note}</p></article>;
}

export default App;
