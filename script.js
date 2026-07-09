// ===========================================================================
// Why Roger Federer is Better Than Novak Djokovic — script.js
// Vanilla D3 + Scrollama. No build step; data is pre-aggregated JSON in /data.
// ===========================================================================

const FEDERER = "Roger Federer";
const DJOKOVIC = "Novak Djokovic";

const COLORS = { [FEDERER]: "#1e5631", [DJOKOVIC]: "#1d4e89" };
const SHORT = { [FEDERER]: "Federer", [DJOKOVIC]: "Djokovic" };
const FONT = "Inter";
const SURFACES = ["All", "Hard", "Grass", "Clay"];

let currentSurface = "All";

// ---------------------------------------------------------------------------
// Shared tooltip (single element reused across every hover interaction)
// ---------------------------------------------------------------------------
const tooltip = d3.select("body").append("div")
  .attr("class", "viz-tooltip")
  .style("position", "absolute").style("pointer-events", "none")
  .style("background", "#1c1a19").style("color", "#f4efe4")
  .style("padding", "6px 10px").style("border-radius", "6px")
  .style("font-family", FONT).style("font-size", 13)
  .style("opacity", 0).style("z-index", 10).style("max-width", "220px");

function showTooltip(event, html) {
  tooltip.style("opacity", 1).html(html)
    .style("left", event.pageX + 14 + "px").style("top", event.pageY - 10 + "px");
}
function moveTooltip(event) {
  tooltip.style("left", event.pageX + 14 + "px").style("top", event.pageY - 10 + "px");
}
function hideTooltip() { tooltip.style("opacity", 0); }

function fmt(v, digits = 1) { return v == null ? "–" : v.toFixed(digits); }
function slug(s) { return s.toLowerCase().replace(/[^a-z]+/g, "-"); }

// ---------------------------------------------------------------------------
// Load data
// ---------------------------------------------------------------------------
Promise.all([
  d3.json("data/federer_by_year.json"),
  d3.json("data/djokovic_by_year.json"),
  d3.json("data/style_fingerprint.json"),
  d3.json("data/serve_placement.json"),
  d3.json("data/h2h.json"),
  d3.json("data/callouts.json"),
]).then(([federerByYear, djokovicByYear, fingerprint, placement, h2h, callouts]) => {
  buildRecordSection(h2h);
  buildArcSection(federerByYear, djokovicByYear);
  buildSurfaceFilter(fingerprint, placement);
  buildFingerprintSection(fingerprint);
  buildGuessCards(fingerprint);
  buildCourtsSection(placement);
  buildClutchSection(h2h);
  buildClosingSection(callouts);
  buildCalculator(fingerprint, h2h);
}).catch((err) => console.error("Data load failed:", err));

// ===========================================================================
// SECTION 1 — The box score (honest H2H)
// ===========================================================================
function buildRecordSection(h2h) {
  const headline = d3.select("#record-headline");
  headline.html("");
  const fed = headline.append("div").attr("class", "record-side");
  fed.append("div").attr("class", "big-num").style("color", COLORS[FEDERER]).text(h2h.federer_wins);
  fed.append("div").attr("class", "name").text("Federer");
  headline.append("div").attr("class", "record-vs").text(`of ${h2h.meetings} charted meetings`);
  const djok = headline.append("div").attr("class", "record-side");
  djok.append("div").attr("class", "big-num").style("color", COLORS[DJOKOVIC]).text(h2h.djokovic_wins);
  djok.append("div").attr("class", "name").text("Djokovic");

  const svg = d3.select("#h2h-timeline");
  const W = 900, H = 200, M = { top: 20, right: 30, bottom: 30, left: 30 };
  const parseDate = d3.timeParse("%Y%m%d");
  const matches = h2h.matches.map((m) => ({ ...m, dateObj: parseDate(m.date) }));
  const x = d3.scaleTime().domain(d3.extent(matches, (d) => d.dateObj)).range([M.left, W - M.right]);

  svg.append("g").attr("transform", `translate(0,${H - M.bottom})`)
    .call(d3.axisBottom(x).ticks(8)).attr("font-family", FONT).attr("font-size", 12);
  svg.append("line").attr("x1", M.left).attr("x2", W - M.right)
    .attr("y1", H / 2).attr("y2", H / 2).attr("stroke", "#c9bfa8");

  svg.selectAll("circle").data(matches).join("circle")
    .attr("cx", (d) => x(d.dateObj)).attr("cy", H / 2)
    .attr("r", (d) => d.is_slam_final ? 9 : 6)
    .attr("fill", (d) => d.winner ? COLORS[d.winner] : "#999")
    .attr("stroke", (d) => d.is_slam_final ? "#1c1a19" : "#f4efe4")
    .attr("stroke-width", (d) => d.is_slam_final ? 2 : 1.5)
    .style("cursor", "pointer")
    .on("mouseenter", (event, d) => showTooltip(event,
      `<b>${d.tournament}</b> ${d.round}${d.is_slam_final ? " (Slam final)" : ""}<br>${d.surface} — ${d.date}<br>Winner: ${d.winner ? SHORT[d.winner] : "?"}`))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip);

  const legend = d3.select("#timeline-legend");
  legend.html("");
  legend.append("span").html(`<span class="dot" style="background:${COLORS[FEDERER]}"></span> Federer win`);
  legend.append("span").html(`<span class="dot" style="background:${COLORS[DJOKOVIC]}"></span> Djokovic win`);
  legend.append("span").html(`<span class="dot" style="background:#fff;border:2px solid #1c1a19"></span> Slam final (bigger dot)`);

  const list = d3.select("#slam-final-list");
  list.html("");
  matches.filter((d) => d.is_slam_final).forEach((d) => {
    const row = list.append("div").attr("class", "slam-final-row");
    row.append("div").text(d.date.slice(0, 4));
    row.append("div").text(`${d.tournament} — ${d.surface}`);
    row.append("div").attr("class", "winner-tag")
      .style("color", d.winner ? COLORS[d.winner] : "#999")
      .text(d.winner ? SHORT[d.winner] + " won" : "unresolved");
  });
}

// ===========================================================================
// SECTION 2 — Career arc (small multiples by age, with hover tooltips)
// ===========================================================================
function buildArcSection(federerByYear, djokovicByYear) {
  const svg = d3.select("#arc-chart");
  const panels = [
    { key: "ace_rate_pct", label: "Ace rate", domain: [0, 16], suffix: "%" },
    { key: "net_freq_pct", label: "Net point frequency", domain: [0, 30], suffix: "%" },
    { key: "winner_ufe_ratio", label: "Winner : UFE ratio", domain: [0.4, 1.6], suffix: "" },
    { key: "return_pts_won_pct", label: "Return points won", domain: [25, 45], suffix: "%" },
  ];
  const panelW = 420, panelH = 190, gapX = 40, gapY = 40;
  const positions = [[10, 10], [10 + panelW + gapX, 10], [10, 10 + panelH + gapY], [10 + panelW + gapX, 10 + panelH + gapY]];
  const ageExtent = [17, 40];
  const byAge = { [FEDERER]: new Map(federerByYear.map((d) => [d.age, d])), [DJOKOVIC]: new Map(djokovicByYear.map((d) => [d.age, d])) };

  const panelGroups = [];

  panels.forEach((panel, i) => {
    const [px, py] = positions[i];
    const g = svg.append("g").attr("transform", `translate(${px},${py})`);
    const M = { top: 22, right: 8, bottom: 24, left: 34 };
    const x = d3.scaleLinear().domain(ageExtent).range([M.left, panelW - M.right]);
    const y = d3.scaleLinear().domain(panel.domain).range([panelH - M.bottom, M.top]);

    g.append("text").attr("x", 0).attr("y", 12).attr("font-family", FONT).attr("font-weight", 700)
      .attr("font-size", 13).attr("fill", "#1c1a19").text(panel.label);

    g.append("g").attr("transform", `translate(0,${panelH - M.bottom})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("d"))).attr("font-family", FONT).attr("font-size", 10);
    g.append("g").attr("transform", `translate(${M.left},0)`)
      .call(d3.axisLeft(y).ticks(4)).attr("font-family", FONT).attr("font-size", 10);

    const line = d3.line().x((d) => x(d.age)).y((d) => y(d[panel.key])).curve(d3.curveMonotoneX);

    [FEDERER, DJOKOVIC].forEach((player) => {
      const data = (player === FEDERER ? federerByYear : djokovicByYear).filter((d) => d[panel.key] != null);
      g.append("path").datum(data).attr("fill", "none").attr("stroke", COLORS[player])
        .attr("stroke-width", 2.5).attr("stroke-linecap", "round").attr("d", line);
    });

    const marker = g.append("line").attr("y1", M.top).attr("y2", panelH - M.bottom)
      .attr("stroke", "#1c1a19").attr("stroke-dasharray", "3 3").attr("stroke-width", 1);

    // hover overlay for exact-value tooltips (independent of the slider marker)
    g.append("rect")
      .attr("x", M.left).attr("y", M.top).attr("width", panelW - M.left - M.right).attr("height", panelH - M.top - M.bottom)
      .attr("fill", "transparent").style("cursor", "crosshair")
      .on("mousemove", function (event) {
        const [mx] = d3.pointer(event, this);
        const age = Math.round(x.invert(mx + M.left));
        const fd = byAge[FEDERER].get(age), dd = byAge[DJOKOVIC].get(age);
        showTooltip(event,
          `<b>Age ${age}</b><br>Federer: ${fd ? fmt(fd[panel.key], panel.suffix ? 1 : 2) + panel.suffix : "–"}<br>Djokovic: ${dd ? fmt(dd[panel.key], panel.suffix ? 1 : 2) + panel.suffix : "–"}`);
      })
      .on("mouseleave", hideTooltip);

    panelGroups.push({ g, x, y, marker, panel, M });
  });

  const legend = svg.append("g").attr("transform", `translate(${positions[1][0] + panelW - 170}, 0)`);
  [FEDERER, DJOKOVIC].forEach((p, i) => {
    const lg = legend.append("g").attr("transform", `translate(${i * 90}, 0)`);
    lg.append("circle").attr("r", 5).attr("cx", 5).attr("cy", 4).attr("fill", COLORS[p]);
    lg.append("text").attr("x", 14).attr("y", 8).attr("font-family", FONT).attr("font-size", 12).attr("font-weight", 600).text(SHORT[p]);
  });

  const slider = document.getElementById("age-slider");
  const ageLabel = document.getElementById("age-label");
  const readout = document.getElementById("arc-readout");

  function setAge(age, highlightPanel = null) {
    age = +age;
    slider.value = age;
    ageLabel.textContent = "age " + age;

    panelGroups.forEach(({ x, marker, g }, i) => {
      marker.transition().duration(250).attr("x1", x(age)).attr("x2", x(age));
      d3.select(g.node()).transition().duration(250)
        .style("opacity", highlightPanel === null || highlightPanel === i ? 1 : 0.35);
    });

    const fd = byAge[FEDERER].get(age);
    const dd = byAge[DJOKOVIC].get(age);
    if (!fd && !dd) {
      readout.innerHTML = `<div class="arc-readout-age">Age ${age}</div><p style="text-align:center;color:var(--ink-soft)">No charted data for either player.</p>`;
      return;
    }

    const rows = [
      { label: "Ace rate", key: "ace_rate_pct", suffix: "%" },
      { label: "Net point freq", key: "net_freq_pct", suffix: "%" },
      { label: "Winner:UFE", key: "winner_ufe_ratio", suffix: "", digits: 2 },
      { label: "Return won", key: "return_pts_won_pct", suffix: "%" },
    ];
    const rowsHtml = rows.map((r) => {
      const fv = fd?.[r.key], dv = dd?.[r.key];
      const fedLeads = fv != null && (dv == null || fv >= dv);
      const djokLeads = dv != null && (fv == null || dv >= fv);
      return `<tr>
        <td>${r.label}</td>
        <td class="${fedLeads ? "leader" : ""}">${fmt(fv, r.digits ?? 1)}${fv != null ? r.suffix : ""}</td>
        <td class="${djokLeads ? "leader" : ""}">${fmt(dv, r.digits ?? 1)}${dv != null ? r.suffix : ""}</td>
      </tr>`;
    }).join("");

    readout.innerHTML = `
      <div class="arc-readout-age">Age ${age}</div>
      <table class="arc-readout-table">
        <thead><tr><th></th><th class="fed-col">Federer</th><th class="djok-col">Djokovic</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;
  }

  slider.addEventListener("input", () => setAge(slider.value));
  setAge(17);

  const stepAges = [22, 27, 30, 33];
  const stepPanels = [0, 1, 2, 3];
  const scroller = scrollama();
  scroller.setup({ step: "#arc-steps .step", offset: 0.6 })
    .onStepEnter((response) => {
      document.querySelectorAll("#arc-steps .step").forEach((el) => el.classList.remove("is-active"));
      response.element.classList.add("is-active");
      setAge(stepAges[response.index], stepPanels[response.index]);
    });
  window.addEventListener("resize", scroller.resize);
}

// ===========================================================================
// SECTION 3 — Surface filter (drives fingerprint, courts, slice bars)
// ===========================================================================
const surfaceListeners = [];
function onSurfaceChange(fn) { surfaceListeners.push(fn); }

function buildSurfaceFilter() {
  const wrap = d3.select("#surface-filter");
  wrap.selectAll(".surface-chip")
    .data(SURFACES)
    .join("div")
    .attr("class", (d) => "surface-chip" + (d === currentSurface ? " active" : ""))
    .text((d) => d)
    .on("click", function (event, d) {
      if (d === currentSurface) return;
      currentSurface = d;
      wrap.selectAll(".surface-chip").classed("active", (dd) => dd === currentSurface);
      surfaceListeners.forEach((fn) => fn(currentSurface));
    });
}

// ===========================================================================
// SECTION 3b — Style fingerprint (radar), surface-aware
// ===========================================================================
function buildFingerprintSection(fingerprint) {
  const players = [FEDERER, DJOKOVIC];
  const axes = [
    { key: "ace_rate_pct", label: "Ace rate", suffix: "%" },
    { key: "net_freq_pct", label: "Net freq", suffix: "%" },
    { key: "winner_ufe_ratio", label: "Winner:UFE", suffix: "" },
    { key: "return_pts_won_pct", label: "Return won", suffix: "%" },
    { key: "first_serve_win_pct", label: "1st serve won", suffix: "%" },
  ];

  const svg = d3.select("#radar-chart");
  const size = 600, center = size / 2, radius = size / 2 - 90;
  const angle = (i) => (Math.PI * 2 * i) / axes.length - Math.PI / 2;
  const g = svg.append("g").attr("transform", `translate(${center},${center})`);

  [0.25, 0.5, 0.75, 1].forEach((r) => {
    g.append("polygon")
      .attr("points", axes.map((_, i) => pt(angle(i), radius * r)).join(" "))
      .attr("fill", "none").attr("stroke", "#c9bfa8").attr("stroke-width", 1);
  });

  axes.forEach((a, i) => {
    const [ax, ay] = pt(angle(i), radius);
    g.append("line").attr("x1", 0).attr("y1", 0).attr("x2", ax).attr("y2", ay).attr("stroke", "#c9bfa8");
    const [lx, ly] = pt(angle(i), radius + 42);
    g.append("text").attr("x", lx).attr("y", ly).attr("text-anchor", "middle")
      .attr("font-family", FONT).attr("font-weight", 600).attr("font-size", 14).text(a.label);
  });

  function pt(ang, r) { return [Math.cos(ang) * r, Math.sin(ang) * r]; }

  // Fixed scale per axis: the highest value either player posts on ANY surface.
  // Computed once (not per-surface) so switching surfaces actually shrinks/grows
  // each player's own polygon instead of always pinning the leader to the edge.
  const fixedMax = {};
  axes.forEach((a) => {
    let best = 0;
    players.forEach((p) => {
      SURFACES.forEach((s) => { best = Math.max(best, fingerprint[p][s][a.key] ?? 0); });
    });
    fixedMax[a.key] = best || 1;
  });
  function playerPoints(p, surface) {
    return axes.map((a, i) => {
      const v = fingerprint[p][surface][a.key] ?? 0;
      return pt(angle(i), radius * (v / fixedMax[a.key]));
    });
  }

  const playerLayers = {};
  players.forEach((p) => {
    const layer = g.append("g");
    const poly = layer.append("polygon")
      .attr("points", playerPoints(p, "All").map((d) => d.join(",")).join(" "))
      .attr("fill", COLORS[p]).attr("fill-opacity", 0.15)
      .attr("stroke", COLORS[p]).attr("stroke-width", 2.5);
    const dots = layer.selectAll("circle").data(axes).join("circle")
      .attr("cx", (a, i) => playerPoints(p, "All")[i][0])
      .attr("cy", (a, i) => playerPoints(p, "All")[i][1])
      .attr("r", 4.5).attr("fill", COLORS[p]).style("cursor", "pointer")
      .on("mouseenter", function (event, a) {
        const v = fingerprint[p][currentSurface][a.key];
        showTooltip(event, `<b>${SHORT[p]}</b> — ${a.label}: ${fmt(v, a.suffix ? 1 : 2)}${a.suffix}`);
      })
      .on("mousemove", moveTooltip)
      .on("mouseleave", hideTooltip);
    playerLayers[p] = { layer, poly, dots };
  });

  function renderRadar(surface) {
    players.forEach((p) => {
      const pts = playerPoints(p, surface);
      playerLayers[p].poly.transition().duration(300).attr("points", pts.map((d) => d.join(",")).join(" "));
      playerLayers[p].dots.data(axes).transition().duration(300)
        .attr("cx", (a, i) => pts[i][0]).attr("cy", (a, i) => pts[i][1]);
    });
  }
  onSurfaceChange(renderRadar);

  const toggle = d3.select("#player-toggle");
  const active = new Set(players);
  players.forEach((p) => {
    toggle.append("div")
      .attr("class", "player-chip active")
      .attr("data-player", p)
      .style("border-color", COLORS[p])
      .text(SHORT[p])
      .on("click", function () {
        if (active.has(p)) active.delete(p); else active.add(p);
        d3.select(this).classed("active", active.has(p));
        playerLayers[p].layer.transition().duration(200).style("opacity", active.has(p) ? 1 : 0.06);
      });
  });
}

// ===========================================================================
// SECTION 3c — Guess-the-stat cards (surface-aware reveal values)
// ===========================================================================
function buildGuessCards(fingerprint) {
  const wrap = d3.select("#stat-highlights");
  wrap.html("");
  const cards = [
    { key: "ace_rate_pct", label: "Ace rate", question: "Who do you think has the higher ace rate?", fmt: (v) => v + "%" },
    { key: "net_freq_pct", label: "Net point frequency", question: "Who comes to net more, you think?", fmt: (v) => v + "%" },
    { key: "winner_ufe_ratio", label: "Winner : unforced error ratio", question: "Who's got the better winner-to-error ratio?", fmt: (v) => v },
  ];

  const cardRefs = [];

  cards.forEach((c) => {
    const card = wrap.append("div").attr("class", "stat-card guessable");
    const q = card.append("div").attr("class", "guess-question").text(c.question);
    const btns = card.append("div").attr("class", "guess-buttons");
    const fedBtn = btns.append("div").attr("class", "guess-btn").text("Federer");
    const djokBtn = btns.append("div").attr("class", "guess-btn").text("Djokovic");
    const result = card.append("div").attr("class", "guess-result");

    function reveal(guessedPlayer) {
      const fedVal = fingerprint[FEDERER][currentSurface][c.key] ?? 0;
      const djokVal = fingerprint[DJOKOVIC][currentSurface][c.key] ?? 0;
      const actualLeader = fedVal >= djokVal ? FEDERER : DJOKOVIC;
      const correct = guessedPlayer === actualLeader;

      fedBtn.classed("picked-correct", guessedPlayer === FEDERER && correct)
        .classed("picked-wrong", guessedPlayer === FEDERER && !correct)
        .classed("reveal-correct", actualLeader === FEDERER && guessedPlayer !== FEDERER);
      djokBtn.classed("picked-correct", guessedPlayer === DJOKOVIC && correct)
        .classed("picked-wrong", guessedPlayer === DJOKOVIC && !correct)
        .classed("reveal-correct", actualLeader === DJOKOVIC && guessedPlayer !== DJOKOVIC);

      result.attr("class", "guess-result " + (correct ? "hit" : "miss"))
        .html((correct ? "✓ yep — " : "✗ nope — ") +
          `Federer ${c.fmt(fedVal)}, Djokovic ${c.fmt(djokVal)}`);

      card.attr("data-revealed", "true").attr("data-key", c.key);
    }

    fedBtn.on("click", () => { if (card.attr("data-revealed") !== "true") reveal(FEDERER); });
    djokBtn.on("click", () => { if (card.attr("data-revealed") !== "true") reveal(DJOKOVIC); });

    cardRefs.push({ card, result, key: c.key, fmtFn: c.fmt });
  });

  onSurfaceChange((surface) => {
    cardRefs.forEach(({ card, result, key, fmtFn }) => {
      if (card.attr("data-revealed") === "true") {
        const fedVal = fingerprint[FEDERER][surface][key] ?? 0;
        const djokVal = fingerprint[DJOKOVIC][surface][key] ?? 0;
        const isHit = result.classed("hit");
        result.html((isHit ? "✓ yep — " : "✗ nope — ") + `Federer ${fmtFn(fedVal)}, Djokovic ${fmtFn(djokVal)}`);
      }
    });
  });
}

// ===========================================================================
// SECTION 3d — Serve placement courts (surface-aware, redrawn on change)
// ===========================================================================
function buildCourtsSection(placement) {
  function render(surface) {
    const row = d3.select("#courts-row");
    row.html("");
    [FEDERER, DJOKOVIC].forEach((p) => {
      const cell = row.append("div").attr("class", "court-cell");
      const svg = cell.append("svg").attr("viewBox", "0 0 300 400");
      drawServeCourt(svg, placement[p][surface].pct, COLORS[p], slug(p));
      cell.append("div").attr("class", "court-label").style("color", COLORS[p]).text(SHORT[p]);
    });
  }
  render("All");
  onSurfaceChange(render);
}

// Heat-blob positions: wide sits near the sideline, T sits near the center
// service line, body sits between them. Same vertical mid-line for all three
// (this is a schematic of where serves land, not a literal shot chart).
function drawServeCourt(svg, pct, color, idPrefix) {
  const zones = [
    { key: "deuce_wide", cx: 34, label: "Wide" },
    { key: "deuce_middle", cx: 77, label: "Body" },
    { key: "deuce_t", cx: 120, label: "T" },
    { key: "ad_t", cx: 180, label: "T" },
    { key: "ad_middle", cx: 223, label: "Body" },
    { key: "ad_wide", cx: 266, label: "Wide" },
  ];
  const maxPct = d3.max(zones, (z) => pct[z.key] ?? 0) || 1;
  const cellH = 260;
  const midY = 6 + (cellH - 12) / 2;
  const g = svg.append("g").attr("transform", "translate(0,60)");
  const defs = svg.append("defs");

  g.append("rect").attr("x", 4).attr("y", 4).attr("width", 292).attr("height", cellH - 8)
    .attr("fill", "#faf7ef").attr("stroke", "#1c1a19").attr("stroke-width", 2);
  g.append("line").attr("x1", 150).attr("x2", 150).attr("y1", 4).attr("y2", cellH - 4)
    .attr("stroke", "#1c1a19").attr("stroke-width", 2);
  g.append("line").attr("x1", 4).attr("x2", 296).attr("y1", midY).attr("y2", midY)
    .attr("stroke", "#c9bfa8").attr("stroke-width", 1).attr("stroke-dasharray", "3 3");

  zones.forEach((z, i) => {
    const v = pct[z.key] ?? 0;
    const intensity = v / maxPct;
    const r = 18 + 46 * intensity;
    const gradId = `${idPrefix}-heat-${i}`;
    const grad = defs.append("radialGradient").attr("id", gradId);
    grad.append("stop").attr("offset", "0%").attr("stop-color", color).attr("stop-opacity", 0.18 + 0.62 * intensity);
    grad.append("stop").attr("offset", "70%").attr("stop-color", color).attr("stop-opacity", (0.18 + 0.62 * intensity) * 0.5);
    grad.append("stop").attr("offset", "100%").attr("stop-color", color).attr("stop-opacity", 0);

    g.append("circle").attr("cx", z.cx).attr("cy", midY).attr("r", r).attr("fill", `url(#${gradId})`);
    g.append("circle").attr("cx", z.cx).attr("cy", midY).attr("r", 3).attr("fill", color);

    g.append("text")
      .attr("x", z.cx).attr("y", midY - r - 8)
      .attr("text-anchor", "middle").attr("font-family", FONT).attr("font-weight", 700)
      .attr("font-size", 14).attr("fill", "#1c1a19")
      .text(v ? v.toFixed(0) + "%" : "–");
    g.append("text")
      .attr("x", z.cx).attr("y", midY + r + 16)
      .attr("text-anchor", "middle").attr("font-family", FONT).attr("font-weight", 400)
      .attr("font-size", 10).attr("fill", "#5a5450")
      .text(z.label);
  });

  g.append("text").attr("x", 75).attr("y", -10).attr("text-anchor", "middle")
    .attr("font-family", FONT).attr("font-weight", 700).attr("font-size", 13).text("Deuce court");
  g.append("text").attr("x", 225).attr("y", -10).attr("text-anchor", "middle")
    .attr("font-family", FONT).attr("font-weight", 700).attr("font-size", 13).text("Ad court");
}

// ===========================================================================
// SECTION 4 — In their own matches
// ===========================================================================
function buildClutchSection(h2h) {
  const statsDiv = d3.select("#clutch-stats");
  statsDiv.html("");
  const metrics = [
    { key: "first_serve_win_pct", label: "1st serve points won", fmt: (v) => v + "%" },
    { key: "return_pts_won_pct", label: "return points won", fmt: (v) => v + "%" },
    { key: "winner_ufe_ratio", label: "winner : UFE ratio", fmt: (v) => v },
    { key: "bp_saved_pct", label: "break points saved", fmt: (v) => v + "%" },
  ];
  metrics.forEach((m) => {
    const card = statsDiv.append("div").attr("class", "stat-card");
    card.append("div").attr("class", "num").style("color", COLORS[FEDERER]).text(m.fmt(h2h.federer[m.key]));
    card.append("div").attr("class", "lbl")
      .html(`${m.label} in their matches<br>(Djokovic: <b style="color:${COLORS[DJOKOVIC]}">${m.fmt(h2h.djokovic[m.key])}</b>)`);
  });

  drawSurfaceChart(d3.select("#clutch-surface-chart"), h2h.federer.surfaces, h2h.djokovic.surfaces);
}

function drawSurfaceChart(svg, fedSurfaces, djokSurfaces) {
  svg.selectAll("*").remove();
  const surfNames = Object.keys(fedSurfaces);
  const W = 500, H = 260, M = { top: 34, right: 20, bottom: 40, left: 40 };

  const x0 = d3.scaleBand().domain(surfNames).range([M.left, W - M.right]).padding(0.35);
  const x1 = d3.scaleBand().domain([FEDERER, DJOKOVIC]).range([0, x0.bandwidth()]).padding(0.12);
  const y = d3.scaleLinear().domain([0, 100]).range([H - M.bottom, M.top]);

  svg.append("g").attr("transform", `translate(0,${H - M.bottom})`)
    .call(d3.axisBottom(x0)).attr("font-family", FONT).attr("font-size", 13);
  svg.append("g").attr("transform", `translate(${M.left},0)`)
    .call(d3.axisLeft(y).ticks(4).tickFormat((d) => d + "%")).attr("font-family", FONT).attr("font-size", 11);

  surfNames.forEach((s) => {
    [FEDERER, DJOKOVIC].forEach((p) => {
      const v = (p === FEDERER ? fedSurfaces : djokSurfaces)[s]?.first_serve_win_pct ?? 0;
      svg.append("rect")
        .attr("x", x0(s) + x1(p)).attr("width", x1.bandwidth())
        .attr("y", y(0)).attr("height", 0).attr("fill", COLORS[p])
        .style("cursor", "pointer")
        .on("mouseenter", (event) => showTooltip(event, `<b>${SHORT[p]}</b> on ${s}: ${v}% of 1st serve points won`))
        .on("mousemove", moveTooltip)
        .on("mouseleave", hideTooltip)
        .transition().duration(500).attr("y", y(v)).attr("height", y(0) - y(v));
    });
  });

  svg.append("text").attr("x", M.left).attr("y", 16).attr("font-family", FONT).attr("font-weight", 700)
    .attr("font-size", 13).text("1st serve points won, by surface (their meetings)");

  const legend = svg.append("g").attr("transform", `translate(${W - 160}, 16)`);
  [FEDERER, DJOKOVIC].forEach((p, i) => {
    const lg = legend.append("g").attr("transform", `translate(${i * 80}, 0)`);
    lg.append("rect").attr("width", 10).attr("height", 10).attr("fill", COLORS[p]);
    lg.append("text").attr("x", 14).attr("y", 9).attr("font-family", FONT).attr("font-size", 11).text(SHORT[p]);
  });
}

// ===========================================================================
// SECTION 5 — Closing callouts
// ===========================================================================
function buildClosingSection(callouts) {
  const wrap = d3.select("#callouts");
  wrap.html("");
  const items = [
    {
      num: callouts.best_ace_match.aces,
      lbl: `aces in one match — ${callouts.best_ace_match.tournament} ${callouts.best_ace_match.round}, ${callouts.best_ace_match.date} vs ${otherPlayer(callouts.best_ace_match)}`,
    },
    {
      num: callouts.best_winner_ratio_match.ratio + "×",
      lbl: `best single-match winner:UFE ratio — ${callouts.best_winner_ratio_match.winners} winners to ${callouts.best_winner_ratio_match.unforced} unforced, ${callouts.best_winner_ratio_match.tournament} ${callouts.best_winner_ratio_match.round} ${callouts.best_winner_ratio_match.date}`,
    },
    { num: callouts.federer_total_matches_charted, lbl: `Federer matches charted, ${callouts.federer_years_span[0]}–${callouts.federer_years_span[1]}` },
    { num: callouts.djokovic_total_matches_charted, lbl: `Djokovic matches charted, ${callouts.djokovic_years_span[0]}–${callouts.djokovic_years_span[1]}` },
  ];
  items.forEach((it) => {
    const card = wrap.append("div").attr("class", "stat-card");
    card.append("div").attr("class", "num").text(it.num);
    card.append("div").attr("class", "lbl").text(it.lbl);
  });
}

function otherPlayer(m) { return m.p1 === FEDERER ? m.p2 : m.p1; }

// ===========================================================================
// SECTION 6 — Greatness Calculator
// ===========================================================================
function buildCalculator(fingerprint, h2h) {
  // Consistency + head-to-head shares are computed directly from the MCP
  // charted data. Consistency deliberately uses metrics NOT picked because
  // Federer leads them — it's a mix (Djokovic actually leads 2 of the 3).
  // "Lower is better" stats (double faults, unforced errors) are inverted
  // by giving the share to whoever has the LOWER rate.
  const fed = fingerprint[FEDERER]["All"], djok = fingerprint[DJOKOVIC]["All"];
  const shareHigherBetter = (f, d) => (f + d) > 0 ? (100 * f) / (f + d) : 50;
  const shareLowerBetter = (f, d) => (f + d) > 0 ? (100 * d) / (f + d) : 50; // inverted

  const consistencyShares = [
    shareHigherBetter(fed.first_serve_in_pct, djok.first_serve_in_pct), // serve reliability
    shareLowerBetter(fed.df_rate_pct, djok.df_rate_pct),                // fewer double faults
    shareLowerBetter(fed.ufe_rate_pct, djok.ufe_rate_pct),              // fewer unforced errors
  ];
  const consistencyFedShare = consistencyShares.reduce((a, b) => a + b, 0) / consistencyShares.length;

  const h2hFedShare = 100 * h2h.federer_wins / (h2h.federer_wins + h2h.djokovic_wins);

  // Peak + Longevity are computed from real ATP record-book stats (Wikipedia,
  // accessed July 2026) — not from the charted dataset. Same share formula
  // (Federer / (Federer + Djokovic)) applied to each cited record.
  const PEAK_RECORDS = [
    { federer: 237, djokovic: 122 }, // longest streak at world No. 1 (weeks)
    { federer: 23, djokovic: 14 },   // consecutive Grand Slam semifinals
    { federer: 41, djokovic: 43 },   // longest match win streak
  ];
  const peakShares = PEAK_RECORDS.map((r) => 100 * r.federer / (r.federer + r.djokovic));
  const peakFedShare = peakShares.reduce((a, b) => a + b, 0) / peakShares.length;

  const LONGEVITY_RECORDS = [
    { federer: 310, djokovic: 428 }, // total weeks at world No. 1
    { federer: 24, djokovic: 23 },   // years as a touring pro (Djokovic still active)
  ];
  const longevityShares = LONGEVITY_RECORDS.map((r) => 100 * r.federer / (r.federer + r.djokovic));
  const longevityFedShare = longevityShares.reduce((a, b) => a + b, 0) / longevityShares.length;

  document.getElementById("def-consistency-split").textContent =
    `${consistencyFedShare.toFixed(1)}% Federer / ${(100 - consistencyFedShare).toFixed(1)}% Djokovic`;
  document.getElementById("def-h2h-split").textContent =
    `${h2hFedShare.toFixed(1)}% Federer / ${(100 - h2hFedShare).toFixed(1)}% Djokovic (${h2h.federer_wins} of ${h2h.federer_wins + h2h.djokovic_wins} meetings)`;
  document.getElementById("def-peak-split").textContent =
    `${peakFedShare.toFixed(1)}% Federer / ${(100 - peakFedShare).toFixed(1)}% Djokovic`;
  document.getElementById("def-longevity-split").textContent =
    `${longevityFedShare.toFixed(1)}% Federer / ${(100 - longevityFedShare).toFixed(1)}% Djokovic`;

  const FACTORS = [
    { key: "consistency", label: "Consistency", federer: consistencyFedShare },
    { key: "peak", label: "Peak", federer: peakFedShare },
    { key: "h2h", label: "Head-to-Head", federer: h2hFedShare },
    { key: "longevity", label: "Longevity", federer: longevityFedShare },
  ];

  const sliderWrap = d3.select("#calc-sliders");
  const weights = {};
  FACTORS.forEach((f) => {
    weights[f.key] = 5;
    const row = sliderWrap.append("div").attr("class", "calc-slider-row");
    row.append("div").attr("class", "calc-label").text(f.label);
    const input = row.append("input")
      .attr("type", "range").attr("min", 0).attr("max", 10).attr("value", 5)
      .attr("id", "calc-w-" + f.key);
    const valueLabel = row.append("div").attr("class", "calc-value").text("5");
    input.on("input", function () {
      weights[f.key] = +this.value;
      valueLabel.text(this.value);
      recompute();
    });
  });

  const barFed = d3.select("#calc-bar-federer");
  const barDjok = d3.select("#calc-bar-djokovic");
  const fedPctLabel = d3.select("#calc-federer-pct");
  const djokPctLabel = d3.select("#calc-djokovic-pct");
  const verdict = d3.select("#calc-verdict");

  function recompute() {
    const totalWeight = FACTORS.reduce((sum, f) => sum + weights[f.key], 0);
    let fedScore = 50;
    if (totalWeight > 0) {
      fedScore = FACTORS.reduce((sum, f) => sum + weights[f.key] * f.federer, 0) / totalWeight;
    }
    const djokScore = 100 - fedScore;
    barFed.style("width", fedScore + "%");
    barDjok.style("width", djokScore + "%");
    fedPctLabel.text("Federer " + fedScore.toFixed(0) + "%");
    djokPctLabel.text("Djokovic " + djokScore.toFixed(0) + "%");

    if (totalWeight === 0) {
      verdict.text("Ok you need to move at least one slider up");
    } else if (Math.abs(fedScore - djokScore) < 3) {
      verdict.text("Too close to call — by your weighting it's basically a coin flip");
    } else {
      const winner = fedScore > djokScore ? "Federer" : "Djokovic";
      verdict.html(`By your weighting: <span style="color:${fedScore > djokScore ? COLORS[FEDERER] : COLORS[DJOKOVIC]}">${winner} wins</span>`);
    }
  }
  recompute();
}
