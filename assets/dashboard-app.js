(() => {
  "use strict";

  const data = window.SKY_CHEFS_DASHBOARD_DATA;
  if (!data) {
    document.body.textContent = "Dashboard data could not be loaded.";
    return;
  }

  const state = {
    location: "ORD",
    airline: "UA",
    grain: "monthly",
  };

  const countFormat = new Intl.NumberFormat("en-US");
  const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const svgNS = "http://www.w3.org/2000/svg";
  const series = [
    { index: 2, threshold: 30, label: "30+ min", className: "series-30", marker: "circle" },
    { index: 3, threshold: 60, label: "60+ min", className: "series-60", marker: "square" },
    { index: 4, threshold: 90, label: "90+ min", className: "series-90", marker: "triangle" },
  ];

  const locationSelect = document.getElementById("location-filter");
  const airlineSelect = document.getElementById("airline-filter");
  const grainInputs = Array.from(document.querySelectorAll('input[name="grain"]'));

  function addOptions(select, values, allLabel, defaultValue) {
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = allLabel;
    select.appendChild(all);
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    select.value = values.includes(defaultValue) ? defaultValue : "all";
  }

  addOptions(locationSelect, data.locations, "All locations", state.location);
  addOptions(airlineSelect, data.airlines, "All airlines", state.airline);

  locationSelect.addEventListener("change", () => {
    state.location = locationSelect.value;
    render();
  });

  airlineSelect.addEventListener("change", () => {
    state.airline = airlineSelect.value;
    render();
  });

  grainInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) {
        state.grain = input.value;
        render();
      }
    });
  });

  function scopeKey() {
    return `${state.location}|${state.airline}`;
  }

  function pct(numerator, denominator) {
    return denominator > 0 ? numerator / denominator : null;
  }

  function formatPct(value) {
    return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
  }

  function formatDelay(value) {
    if (value === null) {
      return "—";
    }
    const rounded = Math.abs(value) < 0.05 ? 0 : value;
    const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
    return `${sign}${Math.abs(rounded).toFixed(1)} min`;
  }

  function formatAxisMinutes(value) {
    const rounded = Math.abs(value) < 0.0001 ? 0 : value;
    const digits = Number.isInteger(rounded) ? 0 : 1;
    const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
    return `${sign}${Math.abs(rounded).toFixed(digits)}`;
  }

  function directionLabel(kind) {
    return kind === "arrival" ? "arrivals" : "departures";
  }

  function renderMetrics(kind, packed) {
    const counts = packed ? packed.o : [0, 0, 0, 0, 0, 0];
    const [scheduled, valid, delay30, delay60, delay90, delaySum] = counts;
    const prefix = kind;
    const noun = directionLabel(kind);

    document.getElementById(`${prefix}-valid`).textContent = packed ? countFormat.format(valid) : "—";
    document.getElementById(`${prefix}-valid-context`).textContent = packed
      ? `${countFormat.format(scheduled)} scheduled ${noun}`
      : "No movements for this filter";
    document.getElementById(`${prefix}-coverage`).textContent = packed ? formatPct(pct(valid, scheduled)) : "—";
    document.getElementById(`${prefix}-average`).textContent = packed
      ? formatDelay(valid > 0 ? delaySum / valid : null)
      : "—";

    [30, 60, 90].forEach((threshold, index) => {
      const delayed = [delay30, delay60, delay90][index];
      document.getElementById(`${prefix}-${threshold}`).textContent = packed ? formatPct(pct(delayed, valid)) : "—";
      document.getElementById(`${prefix}-${threshold}-context`).textContent = packed
        ? `${countFormat.format(delayed)} of ${countFormat.format(valid)} valid`
        : "No valid denominator";
    });
  }

  function setText(id, value) {
    document.getElementById(id).textContent = value;
  }

  function periodRows(packed) {
    const weekly = state.grain === "weekly";
    return {
      periods: weekly ? data.weeks : data.months,
      values: packed ? (weekly ? packed.w : packed.m) : [],
      noun: weekly ? "week" : "month",
    };
  }

  function renderTable(kind, packed) {
    const { periods, values, noun } = periodRows(packed);
    const body = document.getElementById(`${kind}-table-body`);
    body.replaceChildren();
    const periodLabel = noun === "week" ? "Week" : "Month";
    setText(`${kind}-table-title`, `${kind === "arrival" ? "Arrival" : "Departure"} Metrics by ${periodLabel}`);

    if (!packed) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 8;
      cell.textContent = "No movements are available for this location and airline combination.";
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    periods.forEach((period, index) => {
      const [scheduled, valid, delay30, delay60, delay90, delaySum] = values[index];
      const row = document.createElement("tr");
      const periodCell = document.createElement("td");
      periodCell.textContent = period.l;
      if (period.p) {
        const tag = document.createElement("span");
        tag.className = "partial-tag";
        tag.textContent = "Partial";
        periodCell.appendChild(tag);
      }
      row.appendChild(periodCell);

      const cells = [
        countFormat.format(scheduled),
        countFormat.format(valid),
        formatPct(pct(valid, scheduled)),
        formatDelay(valid > 0 ? delaySum / valid : null),
        `${countFormat.format(delay30)} · ${formatPct(pct(delay30, valid))}`,
        `${countFormat.format(delay60)} · ${formatPct(pct(delay60, valid))}`,
        `${countFormat.format(delay90)} · ${formatPct(pct(delay90, valid))}`,
      ];
      cells.forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(svgNS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function appendText(svg, text, x, y, className, anchor = "start") {
    const node = svgElement("text", {
      x,
      y,
      class: className,
      "text-anchor": anchor,
    });
    node.textContent = text;
    svg.appendChild(node);
    return node;
  }

  function ratePoints(values, seriesIndex) {
    return values.map((counts) => pct(counts[seriesIndex], counts[1]));
  }

  function averageDelayPoints(values) {
    return values.map((counts) => counts[1] > 0 ? counts[5] / counts[1] : null);
  }

  function niceCeiling(values) {
    const maximum = Math.max(0, ...values.filter((value) => value !== null));
    return Math.min(1, Math.max(0.1, Math.ceil(maximum * 20) / 20));
  }

  function niceStep(range, targetTicks = 5) {
    const rough = Math.max(range, 1) / targetTicks;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const residual = rough / magnitude;
    const factor = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
    return factor * magnitude;
  }

  function delayDomain(values) {
    const observed = values.filter((value) => value !== null);
    if (!observed.length) {
      return { min: 0, max: 10, step: 2 };
    }

    const rawMin = Math.min(0, ...observed);
    const rawMax = Math.max(0, ...observed);
    const rawRange = Math.max(rawMax - rawMin, 5);
    const padding = Math.max(rawRange * 0.08, 1);
    const paddedMin = rawMin < 0 ? rawMin - padding : 0;
    const paddedMax = rawMax > 0 ? rawMax + padding : 0;
    const step = niceStep(Math.max(paddedMax - paddedMin, 5));
    const min = Math.floor(paddedMin / step) * step;
    let max = Math.ceil(paddedMax / step) * step;
    if (max <= min) {
      max = min + step;
    }
    return { min, max, step };
  }

  function xTickIndexes(periods) {
    return state.grain === "monthly"
      ? periods.map((_, index) => index)
      : [0, 4, 8, 12, 16, 20, periods.length - 1];
  }

  function linePath(points, xScale, yScale) {
    let open = false;
    return points.map((value, index) => {
      if (value === null) {
        open = false;
        return "";
      }
      const command = open ? "L" : "M";
      open = true;
      return `${command}${xScale(index).toFixed(2)},${yScale(value).toFixed(2)}`;
    }).filter(Boolean).join(" ");
  }

  function markerNode(definition, x, y) {
    if (definition.marker === "square") {
      return svgElement("rect", {
        x: x - 4,
        y: y - 4,
        width: 8,
        height: 8,
        rx: 1,
        class: `marker ${definition.className}`,
      });
    }
    if (definition.marker === "triangle") {
      return svgElement("path", {
        d: `M${x},${y - 5} L${x + 5},${y + 4} L${x - 5},${y + 4} Z`,
        class: `marker ${definition.className}`,
      });
    }
    return svgElement("circle", {
      cx: x,
      cy: y,
      r: 4,
      class: `marker ${definition.className}`,
    });
  }

  function shortDate(isoDate) {
    return dateFormat.format(new Date(`${isoDate}T12:00:00`));
  }

  function showTooltip(kind, event, html) {
    const wrap = document.getElementById(`${kind}-chart-wrap`);
    const tooltip = document.getElementById(`${kind}-tooltip`);
    const wrapRect = wrap.getBoundingClientRect();
    const markRect = event.currentTarget.getBoundingClientRect();
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    const x = markRect.left - wrapRect.left + markRect.width / 2;
    const y = markRect.top - wrapRect.top;
    tooltip.style.left = `${Math.max(90, Math.min(wrapRect.width - 90, x))}px`;
    tooltip.style.top = `${Math.max(74, y)}px`;
  }

  function hideTooltip(kind) {
    document.getElementById(`${kind}-tooltip`).hidden = true;
  }

  function renderChart(kind, packed) {
    const { periods, values, noun } = periodRows(packed);
    const periodLabel = noun === "week" ? "Week" : "Month";
    const title = `${kind === "arrival" ? "Arrival" : "Departure"} Delay Rates by ${periodLabel}`;
    setText(`${kind}-chart-title`, title);
    setText(
      `${kind}-chart-subtitle`,
      `Share of valid ${directionLabel(kind)} at each inclusive delay threshold; ${periods.length} periods shown.`
    );

    const svg = document.getElementById(`${kind}-chart`);
    svg.replaceChildren();
    const titleNode = svgElement("title");
    titleNode.textContent = title;
    svg.appendChild(titleNode);

    const descNode = svgElement("desc");
    descNode.textContent = packed
      ? `Three lines show 30, 60, and 90 minute delay percentages for ${periods.length} ${noun} periods.`
      : "No movements are available for this filter.";
    svg.appendChild(descNode);
    setText(`${kind}-chart-desc`, descNode.textContent);

    const width = 960;
    const height = 340;
    const margin = { top: 18, right: 68, bottom: 54, left: 58 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    if (!packed) {
      appendText(svg, "No movements available for this filter", width / 2, height / 2, "no-data", "middle");
      return;
    }

    const allRates = series.flatMap((definition) => ratePoints(values, definition.index));
    const yMax = niceCeiling(allRates);
    const xScale = (index) => margin.left + (periods.length === 1 ? innerWidth / 2 : index * innerWidth / (periods.length - 1));
    const yScale = (value) => margin.top + innerHeight - (value / yMax) * innerHeight;

    const yTicks = 5;
    for (let tick = 0; tick <= yTicks; tick += 1) {
      const value = yMax * tick / yTicks;
      const y = yScale(value);
      svg.appendChild(svgElement("line", {
        x1: margin.left,
        x2: width - margin.right,
        y1: y,
        y2: y,
        class: tick === 0 ? "axis-line" : "grid-line",
      }));
      appendText(svg, `${Math.round(value * 100)}%`, margin.left - 10, y + 4, "axis-label", "end");
    }

    Array.from(new Set(xTickIndexes(periods))).forEach((index) => {
      const x = xScale(index);
      svg.appendChild(svgElement("line", {
        x1: x,
        x2: x,
        y1: margin.top + innerHeight,
        y2: margin.top + innerHeight + 5,
        class: "axis-line",
      }));
      const label = state.grain === "monthly" ? periods[index].l : shortDate(periods[index].s);
      appendText(svg, label, x, margin.top + innerHeight + 24, "axis-label", "middle");
    });

    appendText(svg, "Percent of valid movements", 14, margin.top + innerHeight / 2, "axis-label", "middle")
      .setAttribute("transform", `rotate(-90 14 ${margin.top + innerHeight / 2})`);

    series.forEach((definition) => {
      const rates = ratePoints(values, definition.index);
      const path = svgElement("path", {
        d: linePath(rates, xScale, yScale),
        class: `series-line ${definition.className}`,
      });
      svg.appendChild(path);

      rates.forEach((value, index) => {
        if (value === null) {
          return;
        }
        const x = xScale(index);
        const y = yScale(value);
        const marker = markerNode(definition, x, y);
        const delayed = values[index][definition.index];
        const valid = values[index][1];
        const accessible = `${periods[index].l}, ${definition.label}: ${formatPct(value)}, ${countFormat.format(delayed)} of ${countFormat.format(valid)} valid ${directionLabel(kind)}.`;
        marker.setAttribute("aria-label", accessible);
        const markerTitle = svgElement("title");
        markerTitle.textContent = accessible;
        marker.appendChild(markerTitle);
        marker.addEventListener("pointerenter", (event) => {
          showTooltip(
            kind,
            event,
            `<strong>${periods[index].l}</strong><br>${definition.label}: ${formatPct(value)}<br>${countFormat.format(delayed)} of ${countFormat.format(valid)} valid`
          );
        });
        marker.addEventListener("pointerleave", () => hideTooltip(kind));
        svg.appendChild(marker);
      });
    });
  }

  function renderAverageChart(kind, packed, domain) {
    const { periods, values, noun } = periodRows(packed);
    const direction = kind === "arrival" ? "arrival" : "departure";
    const directionTitle = kind === "arrival" ? "Arrival" : "Departure";
    const periodLabel = noun === "week" ? "Week" : "Month";
    const title = `Average ${directionTitle} Delay by ${periodLabel}`;
    setText(`${kind}-average-chart-title`, title);
    setText(
      `${kind}-average-chart-subtitle`,
      `Volume-weighted average across valid ${directionLabel(kind)}; positive is late and negative is early; ${periods.length} periods shown.`
    );

    const svg = document.getElementById(`${kind}-average-chart`);
    svg.replaceChildren();
    const titleNode = svgElement("title");
    titleNode.textContent = title;
    svg.appendChild(titleNode);

    const descNode = svgElement("desc");
    descNode.textContent = packed
      ? `One line shows average ${direction} delay in minutes for ${periods.length} ${noun} periods. The scale includes zero; positive values are late and negative values are early.`
      : "No movements are available for this filter.";
    svg.appendChild(descNode);
    setText(`${kind}-average-chart-desc`, descNode.textContent);

    const width = 960;
    const height = 340;
    const margin = { top: 18, right: 58, bottom: 54, left: 58 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const averages = averageDelayPoints(values);

    if (!packed || !averages.some((value) => value !== null)) {
      appendText(svg, "No valid movements available for this filter", width / 2, height / 2, "no-data", "middle");
      return;
    }

    const xScale = (index) => margin.left + (periods.length === 1 ? innerWidth / 2 : index * innerWidth / (periods.length - 1));
    const yScale = (value) => margin.top + (domain.max - value) * innerHeight / (domain.max - domain.min);
    const tickCount = Math.round((domain.max - domain.min) / domain.step);

    for (let tick = 0; tick <= tickCount; tick += 1) {
      const value = domain.min + domain.step * tick;
      const y = yScale(value);
      svg.appendChild(svgElement("line", {
        x1: margin.left,
        x2: width - margin.right,
        y1: y,
        y2: y,
        class: Math.abs(value) < 0.0001 ? "zero-line" : "grid-line",
      }));
      appendText(svg, formatAxisMinutes(value), margin.left - 10, y + 4, "axis-label", "end");
    }

    Array.from(new Set(xTickIndexes(periods))).forEach((index) => {
      const x = xScale(index);
      svg.appendChild(svgElement("line", {
        x1: x,
        x2: x,
        y1: margin.top + innerHeight,
        y2: margin.top + innerHeight + 5,
        class: "axis-line",
      }));
      const label = state.grain === "monthly" ? periods[index].l : shortDate(periods[index].s);
      appendText(svg, label, x, margin.top + innerHeight + 24, "axis-label", "middle");
    });

    appendText(svg, "Average delay (minutes)", 14, margin.top + innerHeight / 2, "axis-label", "middle")
      .setAttribute("transform", `rotate(-90 14 ${margin.top + innerHeight / 2})`);

    const definition = {
      marker: "circle",
      className: "series-average",
    };
    svg.appendChild(svgElement("path", {
      d: linePath(averages, xScale, yScale),
      class: "series-line series-average",
    }));

    averages.forEach((value, index) => {
      if (value === null) {
        return;
      }
      const marker = markerNode(definition, xScale(index), yScale(value));
      const valid = values[index][1];
      const accessible = `${periods[index].l}, average ${direction} delay: ${formatDelay(value)}, across ${countFormat.format(valid)} valid ${directionLabel(kind)}.`;
      marker.setAttribute("aria-label", accessible);
      const markerTitle = svgElement("title");
      markerTitle.textContent = accessible;
      marker.appendChild(markerTitle);
      marker.addEventListener("pointerenter", (event) => {
        showTooltip(
          `${kind}-average`,
          event,
          `<strong>${periods[index].l}</strong><br>${formatDelay(value)} average delay<br>${countFormat.format(valid)} valid ${directionLabel(kind)}`
        );
      });
      marker.addEventListener("pointerleave", () => hideTooltip(`${kind}-average`));
      svg.appendChild(marker);
    });
  }

  function render() {
    const key = scopeKey();
    const arrival = data.a[key];
    const departure = data.d[key];
    const locationLabel = state.location === "all" ? "All locations" : state.location;
    const airlineLabel = state.airline === "all" ? "All airlines" : state.airline;
    const periodLabel = state.grain === "monthly" ? "Monthly" : "Weekly";
    setText(
      "scope-summary",
      `${locationLabel} · ${airlineLabel} · ${periodLabel} trend · Feb 1–Jul 20, 2026`
    );

    const averageDomain = delayDomain([
      ...averageDelayPoints(periodRows(arrival).values),
      ...averageDelayPoints(periodRows(departure).values),
    ]);

    renderMetrics("arrival", arrival);
    renderTable("arrival", arrival);
    renderChart("arrival", arrival);
    renderAverageChart("arrival", arrival, averageDomain);

    renderMetrics("departure", departure);
    renderTable("departure", departure);
    renderChart("departure", departure);
    renderAverageChart("departure", departure, averageDomain);
    window.requestAnimationFrame(reportHeight);
  }

  function reportHeight() {
    window.parent.postMessage(
      {
        type: "skychefs-dashboard-height",
        height: document.documentElement.scrollHeight,
      },
      "*"
    );
  }

  if ("ResizeObserver" in window) {
    new ResizeObserver(reportHeight).observe(document.body);
  }
  window.addEventListener("load", reportHeight);
  render();
})();
