const DIRECTIONS = ["North", "South", "East", "West"];
const TIME_FACTORS = { peak: 1.08, mid: 1.0, off: 0.88 };
const WEATHER_FACTORS = { clear: 1.0, cloudy: 1.03, rainy: 1.12 };
const WEATHER_DELTA = { clear: 0, cloudy: 2, rainy: 5 };
const TIME_DELTA = { peak: 3, mid: 1, off: -1 };

const state = {
  timeOfDay: "mid",
  weather: "rainy",
  cycle: 14,
  phaseIndex: 2,
  dirs: {
    North: { vehicles: 12, emergency: false },
    South: { vehicles: 8, emergency: false },
    East: { vehicles: 18, emergency: false },
    West: { vehicles: 5, emergency: false }
  }
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function round(v) { return Math.round(v); }
function density(vehicles) { return Math.min(0.92, Math.max(0.08, vehicles / 43)); }

function computeDirection(dir, value) {
  const d = density(value.vehicles);
  let priority = round(value.vehicles + d * 34);
  if (value.emergency) priority = 100;
  const base = 11 + priority * 0.52;
  const green = clamp(round(base * TIME_FACTORS[state.timeOfDay] * WEATHER_FACTORS[state.weather] + WEATHER_DELTA[state.weather] + TIME_DELTA[state.timeOfDay]), 14, 44);
  return { ...value, density: round(d * 100), priority, green };
}

function getDirections() {
  return DIRECTIONS.map((dir) => ({ dir, ...computeDirection(dir, state.dirs[dir]) }));
}

function getCycle() {
  const ds = getDirections();
  const sumGreen = ds.reduce((a, x) => a + x.green, 0);
  return sumGreen + 8; // four amber/all-red transition seconds
}

function activeDirection(ds) {
  const emergency = ds.find(d => d.emergency);
  if (emergency) return emergency;
  return [...ds].sort((a,b) => b.priority - a.priority)[0];
}

function phaseType(dir, active) {
  return dir.dir === active.dir ? (dir.emergency ? "emergency" : "green") : "red";
}

function renderKpis(ds, cycle) {
  const total = ds.reduce((a, d) => a + d.vehicles, 0);
  const active = activeDirection(ds);
  const waitBase = 37 + Math.max(0, total - 38) * 0.42;
  const rainPenalty = state.weather === "rainy" ? 7 : state.weather === "cloudy" ? 3 : 0;
  const avgWait = round(waitBase * 0.42 + rainPenalty);
  const throughput = round(790 + total * 3.1 + active.green * 1.8);
  const co2 = clamp(round(14 + total * 0.28 + (state.weather === "rainy" ? 4 : 0)), 14, 30);
  const emergency = ds.some(d => d.emergency) ? 100 : 96;
  const kpis = [
    ["⏱️", avgWait + " sec", "AVG WAIT TIME", "↑ 19%", true],
    ["🚘", throughput + " veh/h", "THROUGHPUT", "↑ 9%", false],
    ["🌿", co2 + "%", "CO₂ REDUCTION", "↓ 20%", false],
    ["🚨", emergency + "%", "EMERGENCY RESPONSE", ds.some(d => d.emergency) ? "100%" : "↑ 5%", false]
  ];
  document.getElementById("kpiGrid").innerHTML = kpis.map(([icon,value,label,delta,bad]) => `
    <div class="kpi-card">
      <div class="kpi-top"><span class="kpi-icon">${icon}</span><span class="kpi-delta ${bad ? "bad" : ""}">${delta}</span></div>
      <div class="kpi-value">${value}</div><div class="kpi-label">${label}</div>
    </div>`).join("");
}

function renderIntersection(ds, active) {
  const signalMarkup = (d) => {
    const activeType = phaseType(d, active);
    const greenOn = activeType === "green" || activeType === "emergency";
    const redOn = !greenOn;
    return `<div class="signal ${d.dir[0].toLowerCase()}" data-dir="${d.dir[0]}">
      <span class="light red ${redOn ? "active" : ""}"></span>
      <span class="light yellow"></span>
      <span class="light green ${greenOn ? "active" : ""}"></span>
    </div>`;
  };

  const carsH = Math.min(7, Math.max(2, round(ds[2].vehicles/3)));
  const carsV = Math.min(7, Math.max(3, round(ds[0].vehicles/3)));
  document.getElementById("intersection").innerHTML = `
    <div class="intersection">
      <div class="road v"></div><div class="road h"></div>
      ${signalMarkup(ds[0])}${signalMarkup(ds[1])}${signalMarkup(ds[2])}${signalMarkup(ds[3])}
      <div class="vehicle-line horizontal">${Array.from({length:carsH},()=>'<span class="car"></span>').join("")}</div>
      <div class="vehicle-line vertical">${Array.from({length:carsV},()=>'<span class="car"></span>').join("")}</div>
    </div>`;
}

function renderDirectionCards(ds, active) {
  document.getElementById("directionCards").innerHTML = ds.map(d => {
    const activeOn = d.dir === active.dir;
    const stateText = d.emergency ? "EMERGENCY" : activeOn ? "GREEN" : "RED";
    const color = d.emergency ? "emergency" : activeOn ? "green" : "red";
    return `<div class="direction-card">
      <span class="dir-dot" style="background:${d.emergency ? "var(--magenta)" : activeOn ? "var(--green)" : "var(--red)"}"></span>
      <div><div class="dir-name">${d.dir}</div><div class="dir-sub">${d.vehicles} vehicles</div></div>
      <div class="dir-state"><div class="state-text ${color === "emergency" ? "red" : color}">${stateText}</div><div class="state-time">${d.green}s green</div></div>
    </div>`;
  }).join("");
}

function renderTimeline(ds, active, cycle) {
  const phases = ds.map(d => ({ d, type: d.dir === active.dir ? (d.emergency ? "emergency" : "green") : "red", seconds: d.green }));
  const transition = 2;
  const parts = [];
  phases.forEach((p, idx) => {
    parts.push({ label: `${p.d.dir[0]} ${p.seconds}s`, type:p.type, seconds:p.seconds });
    parts.push({ label:"Y", type:"yellow", seconds:transition });
  });
  document.getElementById("timeline").innerHTML = parts.map(p => {
    const width = (p.seconds / cycle) * 100;
    return `<div class="timeline-seg ${p.type}" style="width:${width}%">${p.seconds >= 6 ? p.label : ""}</div>`;
  }).join("");
}

function renderRecommendation(ds, active) {
  const condition = state.weather === "rainy" ? "adjusted for wet road conditions" : `${state.weather} road conditions`;
  const emergencyText = active.emergency ? " Emergency priority is active for the selected lane." : "";
  document.getElementById("recommendation").innerHTML = `
    <strong>🧠 ML RECOMMENDATION</strong><br>
    Highest priority: <span class="accent">${active.dir} lane</span> with ${active.vehicles} vehicles.
    Suggested green is <span class="accent">${active.green}s</span> — ${condition}.${emergencyText}`;
}

function renderSimulation(ds) {
  document.getElementById("simulationGrid").innerHTML = ds.map(d => `
    <div class="sim-card">
      <div class="sim-card-head"><div><div class="sim-card-title">${d.dir}${d.emergency ? ' <span style="color:var(--magenta)">🚨 EMERGENCY</span>' : ''}</div><div class="sim-meta"><span>Vehicles</span><strong>${d.vehicles}</strong></div></div><div class="sim-green">${d.green}s</div></div>
      <div class="range-wrap"><input type="range" min="0" max="40" value="${d.vehicles}" data-dir="${d.dir}" aria-label="${d.dir} vehicle count"/></div>
      <button class="emergency-btn ${d.emergency ? "active" : ""}" data-emergency="${d.dir}">${d.emergency ? "🚨 Emergency Active" : "Toggle Emergency"}</button>
      <div class="progress"><span style="width:${d.density}%; background:${d.emergency ? 'var(--magenta)' : d.dir === 'East' || d.dir === activeDirection(ds).dir ? 'var(--green)' : 'var(--amber)'}"></span></div>
      <div class="sim-meta"><span>Density: ${d.density}%</span><span>Priority: ${d.priority}</span></div>
    </div>`).join("");

  document.querySelectorAll('input[type="range"]').forEach(input => input.addEventListener("input", (e) => {
    state.dirs[e.target.dataset.dir].vehicles = Number(e.target.value);
    state.cycle += 1;
    render();
  }));
  document.querySelectorAll('[data-emergency]').forEach(button => button.addEventListener("click", () => {
    const dir = button.dataset.emergency;
    state.dirs[dir].emergency = !state.dirs[dir].emergency;
    state.cycle += 1;
    showToast(`${dir} emergency ${state.dirs[dir].emergency ? 'activated' : 'cleared'}`);
    render();
  }));
}

function renderWaitChart() {
  const hours = ["6AM","7AM","8AM","9AM","10AM","11AM","12PM","1PM","2PM","3PM","4PM","5PM","6PM","7PM","8PM"];
  const traditional = [68,50,96,52,48,49,44,61,43,39,47,86,51,65,96];
  const adaptive = [23,24,43,24,16,18,16,31,27,34,31,38,15,24,39];
  const w = 920, h = 320, padL = 42, padR = 20, padT = 18, padB = 42;
  const x = i => padL + i * ((w - padL - padR) / (hours.length - 1));
  const y = v => h - padB - (v / 100) * (h - padT - padB);
  const poly = arr => arr.map((v,i)=>`${x(i)},${y(v)}`).join(" ");
  const gridY = [0,25,50,75,100].map(v => `<g><line x1="${padL}" y1="${y(v)}" x2="${w-padR}" y2="${y(v)}" stroke="#162430" stroke-dasharray="3 5"/><text x="8" y="${y(v)+4}" fill="#6e7b88" font-size="10">${v}</text></g>`).join("");
  const labels = hours.map((t,i)=>`<text x="${x(i)}" y="${h-14}" text-anchor="middle" fill="#6e7b88" font-size="10">${t}</text>`).join("");
  const x9 = x(3), yT = y(traditional[3]), yA = y(adaptive[3]);
  document.getElementById("waitChart").innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Traditional versus adaptive average wait time">
    ${gridY}
    <polygon points="${poly(traditional)} ${x(traditional.length-1)},${h-padB} ${x(0)},${h-padB}" fill="rgba(240,45,59,.08)"/>
    <polygon points="${poly(adaptive)} ${x(adaptive.length-1)},${h-padB} ${x(0)},${h-padB}" fill="rgba(23,221,120,.08)"/>
    <polyline points="${poly(traditional)}" fill="none" stroke="#f02d3b" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <polyline points="${poly(adaptive)}" fill="none" stroke="#17dd78" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <line x1="${x9}" y1="${padT}" x2="${x9}" y2="${h-padB}" stroke="#c7d2dd" stroke-width="1"/>
    <circle cx="${x9}" cy="${yT}" r="5" fill="#f02d3b" stroke="#eef6ff" stroke-width="2"/>
    <circle cx="${x9}" cy="${yA}" r="5" fill="#17dd78" stroke="#eef6ff" stroke-width="2"/>
    <rect x="${x9+16}" y="${yA-70}" width="176" height="82" rx="9" fill="#09131c" stroke="#1a2a38"/>
    <text x="${x9+30}" y="${yA-47}" fill="#e9f2f9" font-size="11" font-weight="800">9AM</text>
    <text x="${x9+30}" y="${yA-21}" fill="#17dd78" font-size="11">adaptive : ${adaptive[3]}s</text>
    <text x="${x9+30}" y="${yA+5}" fill="#f02d3b" font-size="11">traditional : ${traditional[3]}s</text>
    ${labels}
    <text x="15" y="${padT+9}" fill="#6e7b88" font-size="10">sec</text>
  </svg>`;
}

function wireTopControls() {
  document.querySelectorAll("#timeControls button").forEach(btn => btn.addEventListener("click", ()=>{
    state.timeOfDay = btn.dataset.time;
    render();
  }));
  document.querySelectorAll("#weatherControls button").forEach(btn => btn.addEventListener("click", ()=>{
    state.weather = btn.dataset.weather;
    render();
  }));
  document.getElementById("resetBtn").addEventListener("click", ()=>{
    state.timeOfDay = "mid"; state.weather = "rainy"; state.cycle = 14;
    state.dirs.North = { vehicles:12, emergency:false };
    state.dirs.South = { vehicles:8, emergency:false };
    state.dirs.East = { vehicles:18, emergency:false };
    state.dirs.West = { vehicles:5, emergency:false };
    showToast("Simulation reset to the default scenario");
    render();
  });
  document.getElementById("exportBtn").addEventListener("click", ()=>{
    const ds = getDirections();
    const payload = { generatedAt: new Date().toISOString(), timeOfDay: state.timeOfDay, weather: state.weather, cycle: getCycle(), directions: ds };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "traffic-simulation-state.json"; a.click();
    URL.revokeObjectURL(url);
    showToast("Simulation JSON exported");
  });
}

function render() {
  const ds = getDirections();
  const active = activeDirection(ds);
  const cycle = getCycle();
  document.getElementById("cycleNumber").textContent = `#${state.cycle}`;
  document.getElementById("currentPhase").textContent = `${active.dir[0].toUpperCase()}-GREEN`;
  document.getElementById("cycleSeconds").textContent = `${active.green}s`;
  document.getElementById("fullCycle").textContent = `${cycle}s`;
  document.getElementById("simCycle").textContent = `${cycle}s`;
  renderKpis(ds, cycle);
  renderIntersection(ds, active);
  renderDirectionCards(ds, active);
  renderTimeline(ds, active, cycle);
  renderRecommendation(ds, active);
  renderSimulation(ds);
  document.querySelectorAll("#timeControls button").forEach(b => b.classList.toggle("active", b.dataset.time === state.timeOfDay));
  document.querySelectorAll("#weatherControls button").forEach(b => b.classList.toggle("active", b.dataset.weather === state.weather));
}

let toastTimer = null;
function showToast(message) {
  const el = document.getElementById("toast");
  el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

wireTopControls();
render();
renderWaitChart();
