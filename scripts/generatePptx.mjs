import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

process.on("uncaughtException", (error) => {
  console.error("PPTX_UNCAUGHT", error?.name, error?.message, error?.stack);
  process.exitCode = 1;
});
process.on("unhandledRejection", (error) => {
  console.error("PPTX_REJECTION", error?.name, error?.message, error?.stack);
  process.exitCode = 1;
});

process.env.RUNTIME_NODE_MODULES ??= "/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
process.env.RUNTIME_PYTHON ??= "/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

const workspaceDir = process.cwd();
const runtimeModules = process.env.RUNTIME_NODE_MODULES ?? "/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const runtimePython = process.env.RUNTIME_PYTHON ?? "/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const skillDir = "/Users/apple/.codex/plugins/cache/openai-primary-runtime/presentations/26.1118.11504/skills/presentations";
const { Presentation, PresentationFile } = await import(pathToFileURL(path.join(runtimeModules, "@oai/artifact-tool", "dist", "artifact_tool.mjs")).href);
const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, "container_tools", "artifact_tool_utils.mjs")).href);

const COLORS = {
  bg: "#050B18",
  panel: "#0B1428",
  panel2: "#101D35",
  border: "#1E365A",
  cyan: "#00E5FF",
  blue: "#38BDF8",
  violet: "#A78BFA",
  green: "#3DFF9E",
  red: "#FF4D6D",
  amber: "#FFC857",
  text: "#E7F0FF",
  muted: "#A9BEDF",
  dim: "#7186AA",
};
const FONT = "Arial";
const WIDTH = 1280;
const HEIGHT = 720;
const PAGE = { left: 64, top: 58, width: 1152, height: 592 };

const data = JSON.parse(await fs.readFile(path.join(workspaceDir, "presentation", "experiment-results.json"), "utf8"));
const sourceScreenshots = {
  grid: path.join(workspaceDir, "output", "playwright", "mission-grid-learned.png"),
  controls: path.join(workspaceDir, "output", "playwright", "qtable-controls.png"),
  comparison: path.join(workspaceDir, "output", "playwright", "fair-comparison.png"),
  mobile: path.join(workspaceDir, "output", "playwright", "mobile-responsive.png"),
};
const screenshotDir = path.join(workspaceDir, "presentation", "screenshots");
await fs.mkdir(screenshotDir, { recursive: true });
const screenshotBlobs = new Map();
for (const [name, source] of Object.entries(sourceScreenshots)) {
  const target = path.join(screenshotDir, `${name}.png`);
  const bytes = await fs.readFile(source);
  await fs.writeFile(target, bytes);
  screenshotBlobs.set(target, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function textbox(slide, text, left, top, width, height, style = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left, top, width, height },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = { fontFamily: FONT, color: COLORS.text, fontSize: "18pt", ...style };
  shape.text.insets = 0;
  return shape;
}

function box(slide, left, top, width, height, fill = COLORS.panel, line = COLORS.border, radius = "rounded-xl") {
  return slide.shapes.add({
    geometry: "roundRect",
    position: { left, top, width, height },
    fill,
    line: { style: "solid", fill: line, width: 1 },
    borderRadius: radius,
  });
}

function line(slide, left, top, width, color = COLORS.border) {
  return slide.shapes.add({ geometry: "line", position: { left, top, width, height: 0 }, fill: "none", line: { style: "solid", fill: color, width: 1 } });
}

function addBase(slide, number, title, eyebrow = "ADAPTIVE RESCUE GRID") {
  slide.background.fill = COLORS.bg;
  textbox(slide, eyebrow, PAGE.left, 26, 400, 20, { fontSize: "10pt", color: COLORS.cyan, bold: true, characterSpacing: 150 });
  textbox(slide, String(number).padStart(2, "0"), 1155, 26, 60, 20, { fontSize: "10pt", color: COLORS.dim, bold: true, alignment: "right" });
  textbox(slide, title, PAGE.left, 58, PAGE.width, 44, { fontSize: "30pt", color: COLORS.text, bold: true });
  line(slide, PAGE.left, 116, PAGE.width, COLORS.border);
  textbox(slide, "Presidency University · MCA Semester III · CSA4708 Reinforcement Learning · Module 3", PAGE.left, 680, 900, 16, { fontSize: "9pt", color: COLORS.dim });
}

function addScreenshot(slide, imagePath, alt, left, top, width, height) {
  return slide.images.add({
    blob: screenshotBlobs.get(imagePath),
    contentType: "image/png",
    alt,
    fit: "cover",
    position: { left, top, width, height },
    geometry: "roundRect",
    borderRadius: "rounded-xl",
  });
}

function note(slide, content) {
  slide.speakerNotes.text = content;
  slide.speakerNotes.setVisible(true);
}

function bullet(slide, text, left, top, width, color = COLORS.muted) {
  textbox(slide, "•", left, top, 16, 20, { fontSize: "17pt", color: COLORS.cyan, bold: true });
  textbox(slide, text, left + 22, top + 1, width - 22, 40, { fontSize: "16pt", color, breakLine: false });
}

function statText(stat) {
  return `${stat.mean.toFixed(1)} ± ${stat.standardDeviation.toFixed(1)}`;
}

function sampled(values, count = 30) {
  const stride = Math.max(1, Math.ceil(values.length / count));
  const indexes = [];
  for (let index = 0; index < values.length; index += stride) indexes.push(index);
  if (indexes[indexes.length - 1] !== values.length - 1) indexes.push(values.length - 1);
  return { categories: indexes.map((index) => String(index + 1)), values: indexes.map((index) => values[index]) };
}

function addMiniMetric(slide, label, value, left, top, color) {
  textbox(slide, label.toUpperCase(), left, top, 150, 18, { fontSize: "10pt", color: COLORS.dim, bold: true, characterSpacing: 100 });
  textbox(slide, value, left, top + 22, 170, 28, { fontSize: "20pt", color, bold: true });
}

console.log("PPTX: dependencies and real experiment data loaded");
const presentation = Presentation.create({ slideSize: { width: WIDTH, height: HEIGHT } });

// 1. Cover
{
  const slide = presentation.slides.add();
  slide.background.fill = COLORS.bg;
  textbox(slide, "PRESIDENCY UNIVERSITY", 74, 72, 500, 22, { fontSize: "11pt", color: COLORS.cyan, bold: true, characterSpacing: 180 });
  textbox(slide, "Adaptive Rescue Grid", 74, 164, 760, 72, { fontSize: "46pt", color: COLORS.text, bold: true });
  textbox(slide, "Intelligent Rescue Navigation Using SARSA and Q-Learning", 76, 247, 760, 42, { fontSize: "24pt", color: COLORS.muted });
  line(slide, 76, 325, 250, COLORS.cyan);
  textbox(slide, "MCA Semester III · CA-2\nCSA4708 Reinforcement Learning · Module 3: Temporal Difference Learning", 76, 354, 660, 62, { fontSize: "17pt", color: COLORS.muted });
  textbox(slide, "Team: [Member 1] · [Member 2] · [Member 3] · [Member 4] · [Member 5]", 76, 568, 800, 28, { fontSize: "16pt", color: COLORS.text });
  textbox(slide, "Interactive web application + live demonstration", 76, 607, 600, 24, { fontSize: "13pt", color: COLORS.green, bold: true });
  note(slide, "Member 1, 0:00–0:35. Introduce the team, course and project title. State that this is an interactive demonstration, not a static visualization.");
}

// 2. Problem and objectives
{
  const slide = presentation.slides.add();
  addBase(slide, 2, "Rescue navigation problem and project objectives", "MISSION CONTEXT");
  textbox(slide, "A robot must find a rescue route through blocked terrain while learning how hazards and movement costs affect its decisions.", 64, 142, 510, 86, { fontSize: "18pt", color: COLORS.text, bold: true });
  bullet(slide, "Configurable grid with robot, walls, hazards and a rescue destination", 64, 250, 485);
  bullet(slide, "Manual play, animated training, learned-route replay and mobile-friendly controls", 64, 310, 485);
  bullet(slide, "Transparent SARSA / Q-Learning comparison with Q-values, policy and metrics", 64, 370, 485);
  textbox(slide, "Real-world analogy", 64, 478, 210, 22, { fontSize: "13pt", color: COLORS.cyan, bold: true });
  textbox(slide, "Search-and-rescue robots or drones may need to plan around unsafe areas. This project models the decision problem in a small, fully observable simulator.", 64, 505, 480, 72, { fontSize: "15pt", color: COLORS.muted });
  addScreenshot(slide, path.join(screenshotDir, "grid.png"), "Actual learned route in the cliff-side rescue grid", 612, 142, 570, 412);
  textbox(slide, "Actual application screenshot: learned policy overlay and hazardous evacuation strip", 612, 570, 570, 22, { fontSize: "11pt", color: COLORS.dim, alignment: "center" });
  note(slide, "Member 1, 0:35–2:00. Explain the mission, then cover the three objectives. Clarify that the rescue-use analogy does not claim physical-robot validation. Hand over to Member 2 for the MDP.");
}

// 3. MDP
{
  const slide = presentation.slides.add();
  addBase(slide, 3, "The rescue grid as a Markov Decision Process", "MDP MODEL");
  const columns = [
    ["State S", "Robot location\nDiscrete grid cell"],
    ["Actions A", "Up · right · down · left"],
    ["Transition P", "Grid movement\nWall and boundary self-loops"],
    ["Reward R", "Step −1 · wall −2\nGoal +100 · hazard −100"],
    ["Terminal", "Goal; hazard when configured\nCliff preset resets on hazard"],
  ];
  columns.forEach(([heading, body], index) => {
    const left = 64 + index * 225;
    box(slide, left, 166, 202, 170, COLORS.panel, COLORS.border);
    textbox(slide, heading, left + 16, 188, 170, 28, { fontSize: "16pt", color: index === 3 ? COLORS.amber : COLORS.cyan, bold: true });
    textbox(slide, body, left + 16, 230, 170, 74, { fontSize: "14pt", color: COLORS.muted });
  });
  textbox(slide, "Grid mapping", 64, 386, 190, 24, { fontSize: "17pt", color: COLORS.text, bold: true });
  const mapping = [
    ["◆", "Robot\nstart state"], ["✚", "Goal terminal\nreward"], ["▦", "Wall self-loop\npenalty"], ["⚠", "Hazard terminal\nor reset penalty"], ["↑", "Greedy policy action"],
  ];
  mapping.forEach(([symbol, label], index) => {
    const left = 64 + index * 225;
    textbox(slide, symbol, left, 438, 34, 28, { fontSize: "22pt", color: [COLORS.cyan, COLORS.green, COLORS.muted, COLORS.red, COLORS.violet][index], bold: true });
    textbox(slide, label, left + 42, 444, 165, 24, { fontSize: "14pt", color: COLORS.muted });
  });
  textbox(slide, "The Markov property holds in this model because the next transition and reward depend on the current grid state and selected action.", 64, 539, 1050, 38, { fontSize: "17pt", color: COLORS.text });
  note(slide, "Member 2, 2:00–2:55. Define state, action, transition, reward, discount and terminal state using the displayed mapping. Explain the special reset-hazard variant used in the cliff comparison.");
}

// 4. TD learning & exploration
{
  const slide = presentation.slides.add();
  addBase(slide, 4, "TD learning: exploration and terminal bootstrapping", "LEARNING MECHANICS");
  textbox(slide, "One transition at a time", 64, 146, 325, 30, { fontSize: "21pt", color: COLORS.cyan, bold: true });
  textbox(slide, "1. Read Q(s,a)\n2. Execute action in the grid\n3. Observe r and s′\n4. Form TD target\n5. Update the Q-table", 64, 191, 370, 190, { fontSize: "18pt", color: COLORS.text });
  textbox(slide, "ε-greedy behavior", 64, 416, 260, 26, { fontSize: "18pt", color: COLORS.violet, bold: true });
  textbox(slide, "With probability ε choose a seeded random action. Otherwise choose a highest-valued action. The app decays ε from a configurable start value to a minimum value.", 64, 454, 445, 90, { fontSize: "16pt", color: COLORS.muted });
  box(slide, 64, 570, 445, 58, "#12343C", "#2C9A8A");
  textbox(slide, "Terminal transition: bootstrap = 0, so target = reward", 84, 588, 410, 24, { fontSize: "15pt", color: COLORS.green, bold: true });
  addScreenshot(slide, path.join(screenshotDir, "controls.png"), "Actual Q-table inspector and hyperparameter controls", 555, 145, 630, 482);
  note(slide, "Member 2, 2:55–4:00. Explain the five-step TD cycle and epsilon-greedy. Point to the real controls and Q-table. Say clearly that terminal transitions use zero bootstrap because no next decision exists.");
}

// 5. Algorithms
{
  const slide = presentation.slides.add();
  addBase(slide, 5, "SARSA and Q-Learning update rules", "ALGORITHM COMPARISON");
  box(slide, 64, 150, 548, 298, "#101329", "#7B61D9");
  textbox(slide, "SARSA · on-policy", 94, 180, 300, 30, { fontSize: "22pt", color: COLORS.violet, bold: true });
  textbox(slide, "Q(s,a) ← Q(s,a) + α[r + γQ(s′,a′) − Q(s,a)]", 94, 243, 470, 48, { fontSize: "19pt", color: COLORS.text, bold: true, fontFamily: "Courier New" });
  textbox(slide, "The target uses a′, the next action actually selected by the epsilon-greedy behavior policy. This makes SARSA on-policy.", 94, 323, 468, 72, { fontSize: "16pt", color: COLORS.muted });
  box(slide, 668, 150, 548, 298, "#0A1B2A", "#2597C3");
  textbox(slide, "Q-Learning · off-policy", 698, 180, 350, 30, { fontSize: "22pt", color: COLORS.blue, bold: true });
  textbox(slide, "Q(s,a) ← Q(s,a) + α[r + γ maxₐ′Q(s′,a′) − Q(s,a)]", 698, 243, 474, 48, { fontSize: "19pt", color: COLORS.text, bold: true, fontFamily: "Courier New" });
  textbox(slide, "The target uses the highest-valued next action even when the behavior policy explores. This makes Q-Learning off-policy.", 698, 323, 468, 72, { fontSize: "16pt", color: COLORS.muted });
  line(slide, 64, 497, 1152, COLORS.border);
  textbox(slide, "Terminal rule for both methods", 64, 530, 330, 24, { fontSize: "17pt", color: COLORS.amber, bold: true });
  textbox(slide, "If the transition reaches a terminal goal or terminal hazard, target = r. The future-value term is zero.", 64, 567, 1020, 34, { fontSize: "18pt", color: COLORS.text });
  textbox(slide, "Observed behavior near hazards depends on the environment, rewards, seed and ongoing exploration. The project does not promise an always-better algorithm.", 64, 615, 1070, 28, { fontSize: "14pt", color: COLORS.muted });
  note(slide, "Member 3, 4:00–5:05. Read both update rules carefully. Define on-policy and off-policy. Emphasize the terminal rule and avoid claiming that either method always wins.");
}

// 6. Architecture
{
  const slide = presentation.slides.add();
  addBase(slide, 6, "Implementation architecture", "SYSTEM DESIGN");
  const ui = box(slide, 64, 178, 184, 130, COLORS.panel2, COLORS.cyan);
  textbox(slide, "React +\nTypeScript UI", 82, 195, 150, 40, { fontSize: "16pt", color: COLORS.cyan, bold: true, alignment: "center" });
  textbox(slide, "Grid editor · manual pad\ncontrols · replay", 82, 247, 150, 42, { fontSize: "12pt", color: COLORS.muted, alignment: "center" });
  const env = box(slide, 322, 178, 184, 130, COLORS.panel, COLORS.border);
  textbox(slide, "Grid\nenvironment", 340, 195, 148, 40, { fontSize: "16pt", color: COLORS.text, bold: true, alignment: "center" });
  textbox(slide, "Pure transition function\nrewards · terminal rules", 340, 247, 148, 42, { fontSize: "12pt", color: COLORS.muted, alignment: "center" });
  const core = box(slide, 580, 168, 210, 150, "#101329", "#7B61D9");
  textbox(slide, "TD training\nengine", 598, 188, 175, 45, { fontSize: "17pt", color: COLORS.violet, bold: true, alignment: "center" });
  textbox(slide, "Seeded RNG\nQ-table helpers\nSARSA or Q-Learning session", 598, 244, 175, 58, { fontSize: "13pt", color: COLORS.muted, alignment: "center" });
  const metrics = box(slide, 864, 178, 184, 130, COLORS.panel, COLORS.border);
  textbox(slide, "Metrics\nstore", 882, 195, 148, 40, { fontSize: "16pt", color: COLORS.text, bold: true, alignment: "center" });
  textbox(slide, "Rewards · steps\nsuccess · hazards", 882, 247, 148, 42, { fontSize: "12pt", color: COLORS.muted, alignment: "center" });
  const view = box(slide, 1082, 178, 134, 130, COLORS.panel2, COLORS.green);
  textbox(slide, "Evidence", 1094, 202, 110, 24, { fontSize: "17pt", color: COLORS.green, bold: true, alignment: "center" });
  textbox(slide, "Charts\npolicy\ncomparison", 1094, 242, 110, 46, { fontSize: "12pt", color: COLORS.muted, alignment: "center" });
  slide.shapes.connect(ui, env, { kind: "straight", fromSide: "right", toSide: "left", line: { style: "solid", fill: COLORS.cyan, width: 2 }, head: { type: "arrow", width: "med", length: "med" } });
  slide.shapes.connect(env, core, { kind: "straight", fromSide: "right", toSide: "left", line: { style: "solid", fill: COLORS.violet, width: 2 }, head: { type: "arrow", width: "med", length: "med" } });
  slide.shapes.connect(core, metrics, { kind: "straight", fromSide: "right", toSide: "left", line: { style: "solid", fill: COLORS.violet, width: 2 }, head: { type: "arrow", width: "med", length: "med" } });
  slide.shapes.connect(metrics, view, { kind: "straight", fromSide: "right", toSide: "left", line: { style: "solid", fill: COLORS.green, width: 2 }, head: { type: "arrow", width: "med", length: "med" } });
  textbox(slide, "Why this split matters", 64, 392, 250, 26, { fontSize: "18pt", color: COLORS.cyan, bold: true });
  textbox(slide, "The trainer is framework-independent, so unit tests verify the environment and update rules without relying on the visual interface. The UI consumes only genuine session output.", 64, 432, 1120, 60, { fontSize: "20pt", color: COLORS.text });
  textbox(slide, "Source modules: rng.ts · grid.ts · qtable.ts · trainer.ts · presets.ts · React dashboard components", 64, 548, 1120, 24, { fontSize: "14pt", color: COLORS.muted, fontFamily: "Courier New" });
  note(slide, "Member 3, 5:05–6:00. Walk left to right through the architecture. State that the UI never fabricates learning values; it displays the trainer’s seeded results. Hand over to Member 4.");
}

// 7. Methodology
{
  const slide = presentation.slides.add();
  addBase(slide, 7, "Fair hazardous-map comparison", "EXPERIMENT DESIGN");
  textbox(slide, "Cliff-side scenario", 64, 146, 380, 28, { fontSize: "21pt", color: COLORS.red, bold: true });
  textbox(slide, "12 × 4 grid. Start at the lower-left, rescue at the lower-right, and a reset-hazard strip lies between them. Persistent exploration keeps the risk visible during learning.", 64, 188, 500, 76, { fontSize: "17pt", color: COLORS.muted });
  addScreenshot(slide, path.join(screenshotDir, "grid.png"), "Hazardous cliff-side grid used in the demonstration", 64, 292, 500, 268);
  textbox(slide, "Protocol", 628, 146, 220, 28, { fontSize: "21pt", color: COLORS.cyan, bold: true });
  const protocol = [
    `Five matched seeds: ${data.protocol.seeds.join(", ")}`,
    `${data.protocol.hyperparameters.episodes} episodes per seed · ${data.protocol.hyperparameters.maxStepsPerEpisode} step cap`,
    `α = ${data.protocol.hyperparameters.alpha}, γ = ${data.protocol.hyperparameters.gamma}, ε = ${data.protocol.hyperparameters.epsilonStart} (persistent)`,
    "Fresh zero Q-table for each algorithm and each seed",
    "Record reward, steps, success, hazard entries and greedy route",
  ];
  protocol.forEach((item, index) => bullet(slide, item, 628, 196 + index * 55, 535));
  box(slide, 628, 495, 535, 100, "#071126", COLORS.border);
  textbox(slide, "Terminal-safe TD update", 648, 512, 420, 20, { fontSize: "13pt", color: COLORS.amber, bold: true });
  textbox(slide, "const target = terminal ? reward : reward + gamma * bootstrap;\nq[s,a] += alpha * (target - q[s,a]);", 648, 540, 480, 40, { fontSize: "12pt", color: COLORS.text, fontFamily: "Courier New" });
  note(slide, "Member 4, 6:00–6:55. Explain why this map can reveal differing behavior without making a universal claim. Confirm matched seeds, fresh Q-tables, and the terminal-safe code pattern.");
}

// 8. Implementation / live demo
{
  const slide = presentation.slides.add();
  addBase(slide, 8, "Implementation evidence and live-demo flow", "LIVE DEMONSTRATION");
  textbox(slide, "The application supports manual navigation, animated TD updates, seeded controls, learned-policy replay, Q-table inspection and a fair comparison dashboard.", 64, 145, 1080, 46, { fontSize: "19pt", color: COLORS.text });
  addScreenshot(slide, path.join(screenshotDir, "mobile.png"), "Actual responsive mobile application layout", 64, 222, 380, 320);
  textbox(slide, "Actual mobile-responsive view", 64, 558, 380, 20, { fontSize: "11pt", color: COLORS.dim, alignment: "center" });
  const demoSteps = [
    ["1", "Load the hazardous preset and make one manual move"],
    ["2", "Set algorithm, seed, α, γ, ε and training speed"],
    ["3", "Start or pause training and inspect a Q-table update"],
    ["4", "Replay the greedy route and run the fair comparison"],
  ];
  demoSteps.forEach(([number, body], index) => {
    const top = 245 + index * 72;
    box(slide, 523, top, 40, 40, index === 0 ? COLORS.cyan : COLORS.panel2, COLORS.border, "rounded-full");
    textbox(slide, number, 523, top + 8, 40, 22, { fontSize: "15pt", color: index === 0 ? COLORS.bg : COLORS.text, bold: true, alignment: "center" });
    textbox(slide, body, 585, top + 8, 545, 35, { fontSize: "18pt", color: COLORS.text });
  });
  textbox(slide, "Live demonstration requirement", 523, 552, 320, 21, { fontSize: "14pt", color: COLORS.green, bold: true });
  textbox(slide, "Show a short real training sequence even if a completed seeded run is kept ready as a fallback.", 523, 580, 585, 34, { fontSize: "15pt", color: COLORS.muted });
  note(slide, "Member 4, 6:55–8:00. Perform the live demo: manual move, start/pause, Q-table or chart, route replay and fair comparison. The mobile screenshot supports the responsive-design claim, but the live app must be shown.");
}

// 9. Actual results
{
  const slide = presentation.slides.add();
  addBase(slide, 9, "Actual experimental results: five matched cliff-side runs", "EVIDENCE FROM EXECUTED EXPERIMENTS");
  textbox(slide, "Mean ± population standard deviation across five real seeded runs. Results apply to this static grid and displayed configuration only.", 64, 142, 1115, 28, { fontSize: "14pt", color: COLORS.muted });
  const rewardS = sampled(data.sarsa.rollingReward);
  const rewardQ = sampled(data.qLearning.rollingReward);
  slide.charts.add("line", {
    position: { left: 64, top: 192, width: 545, height: 215 },
    title: "20-episode rolling mean reward",
    titleTextStyle: { fontFamily: FONT, fontSize: "13pt", color: COLORS.text, bold: true },
    categories: rewardS.categories,
    series: [
      { name: "SARSA", values: rewardS.values, line: { style: "solid", fill: COLORS.violet, width: 2 }, marker: { symbol: "none" } },
      { name: "Q-Learning", values: rewardQ.values, line: { style: "solid", fill: COLORS.blue, width: 2 }, marker: { symbol: "none" } },
    ],
    hasLegend: true,
    legend: { position: "bottom", textStyle: { fontFamily: FONT, fontSize: "10pt", color: COLORS.muted } },
    xAxis: { textStyle: { fontFamily: FONT, fontSize: "8pt", color: COLORS.dim } },
    yAxis: { textStyle: { fontFamily: FONT, fontSize: "8pt", color: COLORS.dim }, majorGridlines: { style: "solid", fill: COLORS.border, width: 1 } },
    chartFill: COLORS.panel,
    plotAreaFill: COLORS.panel,
    plotAreaLine: { style: "solid", fill: COLORS.border, width: 1 },
  });
  const successS = sampled(data.sarsa.rollingSuccessPercent);
  const successQ = sampled(data.qLearning.rollingSuccessPercent);
  slide.charts.add("line", {
    position: { left: 670, top: 192, width: 545, height: 215 },
    title: "20-episode rolling success rate (%)",
    titleTextStyle: { fontFamily: FONT, fontSize: "13pt", color: COLORS.text, bold: true },
    categories: successS.categories,
    series: [
      { name: "SARSA", values: successS.values, line: { style: "solid", fill: COLORS.violet, width: 2 }, marker: { symbol: "none" } },
      { name: "Q-Learning", values: successQ.values, line: { style: "solid", fill: COLORS.blue, width: 2 }, marker: { symbol: "none" } },
    ],
    hasLegend: true,
    legend: { position: "bottom", textStyle: { fontFamily: FONT, fontSize: "10pt", color: COLORS.muted } },
    xAxis: { textStyle: { fontFamily: FONT, fontSize: "8pt", color: COLORS.dim } },
    yAxis: { textStyle: { fontFamily: FONT, fontSize: "8pt", color: COLORS.dim }, majorGridlines: { style: "solid", fill: COLORS.border, width: 1 } },
    chartFill: COLORS.panel,
    plotAreaFill: COLORS.panel,
    plotAreaLine: { style: "solid", fill: COLORS.border, width: 1 },
  });
  const table = slide.tables.add({
    rows: 6,
    columns: 3,
    left: 64,
    top: 444,
    width: 810,
    height: 178,
    values: [
      ["Metric", "SARSA", "Q-Learning"],
      ["Final rolling reward", statText(data.sarsa.finalRollingReward), statText(data.qLearning.finalRollingReward)],
      ["End-window success", `${statText(data.sarsa.finalWindowSuccessPercent)}%`, `${statText(data.qLearning.finalWindowSuccessPercent)}%`],
      ["Mean steps / episode", statText(data.sarsa.meanSteps), statText(data.qLearning.meanSteps)],
      ["Hazard entries / run", statText(data.sarsa.hazardHits), statText(data.qLearning.hazardHits)],
      ["Displayed greedy route", `${data.sarsa.displayRun.route.length - 1} moves`, `${data.qLearning.displayRun.route.length - 1} moves`],
    ],
  });
  table.styleOptions = { headerRow: true, bandedRows: true };
  table.borders.assign({ style: "solid", fill: COLORS.border, width: 1 });
  for (let col = 0; col < 3; col += 1) {
    table.getCell(0, col).fill = COLORS.panel2;
    table.getCell(0, col).text.style = { fontFamily: FONT, fontSize: "12pt", bold: true, color: COLORS.text };
  }
  table.cells.block({ row: 1, column: 0, rowCount: 5, columnCount: 3 }).assign({ fill: COLORS.panel, textStyle: { fontFamily: FONT, fontSize: "10pt", color: COLORS.muted } });
  addScreenshot(slide, path.join(screenshotDir, "comparison.png"), "Actual in-app fair comparison dashboard", 908, 444, 308, 178);
  textbox(slide, "In-app comparison screenshot", 908, 632, 308, 16, { fontSize: "9pt", color: COLORS.dim, alignment: "center" });
  note(slide, `Member 5, 8:00–9:15. Present results as configuration-specific evidence. Protocol: 5 matched seeds, ${data.protocol.hyperparameters.episodes} episodes, alpha ${data.protocol.hyperparameters.alpha}, gamma ${data.protocol.hyperparameters.gamma}, epsilon ${data.protocol.hyperparameters.epsilon}. Do not call either algorithm universally better.`);
}

// 10. Conclusions and limitations
{
  const slide = presentation.slides.add();
  addBase(slide, 10, "Conclusion, limitations and live handoff", "CLOSING");
  textbox(slide, "Project proof", 64, 150, 380, 28, { fontSize: "21pt", color: COLORS.cyan, bold: true });
  bullet(slide, "Genuine tabular SARSA and Q-Learning updates with seeded epsilon-greedy exploration", 64, 203, 510);
  bullet(slide, "Transparent learning evidence through Q-tables, routes, reward curves, steps and success rates", 64, 274, 510);
  bullet(slide, "A hazardous scenario where observed behavior can differ without a universal winner claim", 64, 345, 510);
  textbox(slide, "Limitations", 665, 150, 260, 28, { fontSize: "21pt", color: COLORS.amber, bold: true });
  bullet(slide, "Small discrete state space; tabular learning does not scale directly to large or continuous worlds", 665, 203, 500, COLORS.muted);
  bullet(slide, "Static, fully observable maps and hand-designed rewards", 665, 274, 500, COLORS.muted);
  bullet(slide, "No physical robot validation or dynamic-obstacle model", 665, 345, 500, COLORS.muted);
  line(slide, 64, 462, 1152, COLORS.border);
  textbox(slide, "Five-speaker delivery", 64, 498, 260, 24, { fontSize: "18pt", color: COLORS.violet, bold: true });
  const roles = ["1: Problem", "2: MDP + TD", "3: Algorithms", "4: Method + demo", "5: Results + Q&A"];
  roles.forEach((role, index) => textbox(slide, role, 64 + index * 225, 545, 200, 24, { fontSize: "14pt", color: index === 3 ? COLORS.green : COLORS.text, bold: true }));
  textbox(slide, "Next: demonstrate the application live, then invite questions.", 64, 610, 920, 30, { fontSize: "22pt", color: COLORS.green, bold: true });
  note(slide, "Member 5, 9:15–10:00. Give the three grounded conclusions, the limitations and next steps. Confirm that every team member speaks. End by opening the live application and inviting questions.");
}

const buildDir = path.join(workspaceDir, ".codex-build", "presentation");
const previewDir = path.join(buildDir, "previews");
const stagingDir = path.join(workspaceDir, ".codex-finalizer");
const candidatePath = path.join(stagingDir, "Adaptive_Rescue_Grid_CA2.candidate.pptx");
const finalPath = path.join(workspaceDir, "presentation", "Adaptive_Rescue_Grid_CA2.pptx");
const receiptPath = path.join(buildDir, "Adaptive_Rescue_Grid_CA2.validation.json");
await fs.mkdir(previewDir, { recursive: true });
await fs.mkdir(stagingDir, { recursive: true });

async function archivePrevious(filePath) {
  try {
    await fs.access(filePath);
    const extension = path.extname(filePath);
    const basename = path.basename(filePath, extension);
    const archivePath = path.join(stagingDir, `${basename}.previous-${Date.now()}${extension}`);
    await fs.rename(filePath, archivePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

await archivePrevious(finalPath);
await archivePrevious(receiptPath);
for (const [index, slide] of presentation.slides.items.entries()) {
  console.log(`PPTX: rendering preview ${index + 1}/10`);
  const image = await presentation.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(previewDir, `slide-${String(index + 1).padStart(2, "0")}.png`), new Uint8Array(await image.arrayBuffer()));
}
console.log("PPTX: exporting editable PowerPoint");
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
console.log("PPTX: validating PowerPoint package");
const result = await finalizePresentation({
  explicitTotalSlideCount: 10,
  requiredNativeTableOwnerSlides: [9],
  requiredNativeChartOwnerSlides: [9],
  materializeLiteralChartWorkbooks: true,
  nativeChartTargetApplication: "powerpoint",
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable: runtimePython,
  integrityValidatorPath: path.join(skillDir, "container_tools", "inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(skillDir, "container_tools", "inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-bullet-geometry", "--validate-heading-fit", "--require-native-table-slide", "9"],
  fontPolicy: { basis: "design", families: [FONT] },
  verifyArtifactToolImport: true,
  receiptPath,
});
console.log(JSON.stringify({ finalPath, previewDir, validation: result }, null, 2));
