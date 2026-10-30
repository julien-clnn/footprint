import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { useEffect, useRef } from "react";
import { WEAK } from "./graph.js";
import "./graph.css";

cytoscape.use(fcose);

const TOKENS = ["bg", "surface", "ink", "muted", "faint", "line", "accent", "accent-soft", "exposed",
  "exposed-soft", "teal", "radius", "radius-sm", "font-sans", "font-mono", "ease"];
const MAX_FOCUS_ZOOM = 1.2;
const AVATAR = 18;
const AVATAR_GAP = 5;
const PAD = 48;

function readTokens() {
  const css = getComputedStyle(document.documentElement);
  return Object.fromEntries(TOKENS.map((t) => [t, css.getPropertyValue(`--${t}`).trim()]));
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

let measureCtx;
function textWidth(text, font) {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

// Platform code drawn inside account nodes (a node has a single label, used for the platform name).
const codeIcons = new Map();
function codeIcon(code, color, font) {
  const key = code + color;
  if (!codeIcons.has(key)) {
    const size = code.length > 2 ? 9 : code.length > 1 ? 10.5 : 12;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 30 30">`
      + `<text x="15" y="15.5" text-anchor="middle" dominant-baseline="middle" font-family='${font}' `
      + `font-size="${size}" font-weight="600" fill="${color}">${code.replace(/[<>&]/g, "")}</text></svg>`;
    codeIcons.set(key, `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
  }
  return codeIcons.get(key);
}

function buildStyle(t) {
  const radius = parseFloat(t.radius) || 14;
  const sans = t["font-sans"];
  const mono = t["font-mono"];
  const pill = (color) => ({
    label: "data(label)", "font-family": mono, "font-size": 8, color,
    "text-background-color": t.surface, "text-background-opacity": 1,
    "text-background-shape": "round-rectangle", "text-background-padding": 2,
    "text-border-width": 1, "text-border-color": color, "text-border-opacity": 1,
  });
  return [
    { selector: "node", style: {
      label: "", "font-family": sans, "font-size": 9, color: t.muted, "text-valign": "bottom",
      "text-margin-y": 5, "min-zoomed-font-size": 6, "overlay-opacity": 0,
      "transition-property": "border-color, border-width, background-color",
      "transition-duration": reducedMotion() ? 0 : 150,
    } },
    { selector: "node[kind = 'search']", style: {
      shape: "round-rectangle", label: "data(label)", width: (n) => textWidth(n.data("label"), `700 13px ${sans}`) + 64,
      height: 38, "corner-radius": 19, "background-color": t.accent, color: t.surface, "font-size": 13,
      "font-weight": 700, "text-valign": "center", "text-margin-y": 0, "border-width": 0,
      "border-color": t["accent-soft"], "z-index": 20,
    } },
    { selector: "node[kind = 'search']:selected", style: { "border-width": 4 } },
    { selector: "node[kind = 'person']", style: {
      shape: "round-rectangle", "corner-radius": radius, "background-color": t.surface, "border-width": 1,
      "border-color": t.line, padding: 22, label: "data(label)", "text-valign": "top", "text-margin-y": -6,
      "font-size": 11, "font-weight": 500, color: t.muted, "min-width": 150,
    } },
    // Room on the left of the name for the round photo (an <img> over the canvas, see placeAvatars).
    { selector: "node[kind = 'person'][avatar]", style: {
      "text-margin-x": (AVATAR + AVATAR_GAP) / 2, "text-margin-y": -8,
    } },
    { selector: "node[kind = 'person'].exposed", style: {
      "background-color": t["exposed-soft"], "border-color": t.exposed, "border-width": 1.5,
      color: t.ink, "font-size": 13, "font-weight": 700,
    } },
    { selector: "node[kind = 'person'].weak, node[kind = 'person'].unattributed", style: {
      "background-opacity": 0, "border-style": "dashed", "border-color": t.faint, "border-opacity": 0.55,
      "corner-radius": parseFloat(t["radius-sm"]) || 10, "font-family": mono, "font-size": 10,
      "font-weight": 400, color: t.faint, padding: 18, "min-width": 0,
    } },
    { selector: "node[kind = 'person']:selected", style: { "border-color": t.accent, "border-width": 2, "border-opacity": 1 } },
    { selector: "node[kind = 'account']", style: {
      shape: "round-rectangle", width: 30, height: 30, "corner-radius": 7, "background-color": t.surface,
      "border-width": 1, "border-color": t.line, label: "data(caption)", "text-wrap": "ellipsis",
      "text-max-width": 170, "text-outline-color": t.surface, "text-outline-width": 2,
      "background-image": (n) => codeIcon(n.data("code"), t.ink, mono),
      "background-width": "100%", "background-height": "100%",
    } },
    { selector: "node[kind = 'account'].exposed", style: {
      "border-color": t.exposed, "border-width": 1.5, "text-outline-color": t["exposed-soft"],
    } },
    { selector: "node[kind = 'account'].orphan", style: { "text-outline-width": 0 } },
    { selector: "node[kind = 'account'].orphan", style: {
      shape: "ellipse", "border-style": "dashed", "border-color": t.faint,
      "background-image": (n) => codeIcon(n.data("code"), t.faint, mono),
    } },
    { selector: "node[kind = 'account'].weakhit", style: {
      width: 12, height: 12, "corner-radius": 3, "background-color": t.line, "border-width": 0,
      "background-image": "none", label: "",
    } },
    { selector: "node[kind = 'account'].tocheck", style: {
      "border-style": "dashed", "border-color": t.accent, "border-width": 1.5,
    } },
    { selector: "node[kind = 'account'].hover", style: { "border-color": t.accent } },
    { selector: "node[kind = 'account']:selected", style: { "border-color": t.accent, "border-width": 2, "border-style": "solid" } },
    { selector: "node[kind = 'account'].weakhit:selected", style: { "background-color": t.accent } },
    { selector: "node[kind = 'fact']", style: {
      shape: "round-rectangle", width: 10, height: 10, "corner-radius": 2, "background-color": t.surface,
      "border-width": 1.5, "border-color": t.teal, label: "data(label)", "font-family": mono, color: t.teal,
      "text-valign": "center", "text-halign": "right", "text-margin-x": 5, "text-margin-y": 0,
      "text-wrap": "ellipsis", "text-max-width": 220, "text-outline-color": t.surface, "text-outline-width": 2,
    } },
    { selector: "node[kind = 'fact'].exposed", style: { "text-outline-color": t["exposed-soft"] } },
    { selector: "node[kind = 'fact'].hover, node[kind = 'fact']:selected", style: { "background-color": t.teal } },
    { selector: "node[kind = 'close']", style: {
      width: (n) => Math.min(8 + 2 * n.data("strength"), 16), height: (n) => Math.min(8 + 2 * n.data("strength"), 16),
      "background-color": t["accent-soft"], "border-width": 1.5, "border-color": t.accent, label: "data(label)",
      "font-size": 9, color: t.muted, "text-margin-y": 4, "text-wrap": "ellipsis", "text-max-width": 110,
      "text-outline-color": t.bg, "text-outline-width": 2,
    } },
    { selector: "node[kind = 'close'].hover, node[kind = 'close']:selected", style: {
      "background-color": t.accent, color: t.ink,
    } },
    // Search around a person: a pill tied to that person, its own people around it once done.
    { selector: "node[kind = 'hub']", style: {
      shape: "round-rectangle", label: "data(label)", "text-wrap": "wrap", "text-valign": "center",
      "text-margin-y": 0, "text-max-width": 200, "line-height": 1.35,
      width: (n) => Math.max(...n.data("label").split("\n").map((l) => textWidth(l, `700 11px ${sans}`))) + 40,
      height: (n) => (n.data("label").includes("\n") ? 42 : 30), "corner-radius": 15,
      "background-color": t["accent-soft"], "border-width": 1.5, "border-color": t.accent, color: t.accent,
      "font-size": 11, "font-weight": 700, "z-index": 15,
      "transition-property": "border-width, border-color, background-color",
      "transition-duration": reducedMotion() ? 0 : 650,
    } },
    { selector: "node[kind = 'hub'].done", style: { "background-color": t.accent, color: t.surface } },
    { selector: "node[kind = 'hub'].collapsed", style: {
      "background-color": t.surface, color: t.accent, "border-style": "dashed",
    } },
    { selector: "node[kind = 'hub'].queued, node[kind = 'hub'].draft", style: { "border-style": "dashed", color: t.muted, "border-color": t.faint } },
    { selector: "node[kind = 'hub'].running.pulse", style: { "border-width": 6, "border-color": t["accent-soft"] } },
    { selector: "node[kind = 'hub'].error", style: {
      "background-color": t["exposed-soft"], "border-color": t.exposed, color: t.exposed,
    } },
    { selector: "node[kind = 'hub']:selected", style: { "border-width": 4, "border-color": t.ink } },
    { selector: "node[kind = 'person'].sub", style: { "border-color": t.accent, "border-opacity": 0.45 } },
    // The accounts a detail was found on (a chip clicked in the details panel), the rest dimmed.
    { selector: ".faded", style: { opacity: 0.18 } },
    { selector: "node.lit", style: {
      "border-color": t.exposed, "border-width": 2.5, "underlay-color": t.exposed, "underlay-padding": 7,
      "underlay-opacity": 0.22, "underlay-shape": "round-rectangle", "z-index": 30,
      "transition-property": "underlay-opacity, underlay-padding", "transition-duration": reducedMotion() ? 0 : 600,
    } },
    { selector: "node.lit.pulse", style: { "underlay-opacity": 0.08, "underlay-padding": 11 } },
    { selector: "edge", style: {
      width: 1, "curve-style": "bezier", "line-color": t.faint, "line-cap": "round", "font-family": mono,
      "overlay-opacity": 0,
    } },
    { selector: "edge.root, edge.around", style: {
      "curve-style": "straight", "source-arrow-shape": "circle", "target-arrow-shape": "circle",
      "arrow-scale": 0.55, "source-arrow-color": t.faint, "target-arrow-color": t.faint,
    } },
    { selector: "edge.root", style: { "line-opacity": 0.4 } },
    { selector: "edge.root.sub", style: { "line-color": t.accent, "source-arrow-color": t.accent,
      "target-arrow-color": t.accent } },
    { selector: "edge.cross", style: {
      width: 1.5, "line-color": t.accent, "line-style": "dashed", "line-dash-pattern": [1, 4], "line-opacity": 0.8,
      "target-arrow-shape": "circle", "target-arrow-color": t.accent, "arrow-scale": 0.5,
    } },
    { selector: "edge.proven", style: { width: 2, "line-color": t.ink } },
    { selector: "edge.inferred", style: {
      width: 1.5, "line-color": t.accent, "line-style": "dashed", "line-dash-pattern": [6, 4],
      ...pill(t.accent),
    } },
    { selector: "edge.weak", style: {
      width: 1.5, "line-color": t.faint, "line-dash-pattern": [0.5, 4], ...pill(t.faint),
    } },
    { selector: "edge.lead", style: {
      width: 1.5, "line-color": t.teal, "line-style": "dashed", "line-dash-pattern": [8, 3, 1, 3],
    } },
    { selector: "edge.shared", style: {
      "line-color": t.teal, "line-style": "dashed", "line-dash-pattern": [0.5, 3], "line-opacity": 0.85,
    } },
    { selector: "edge.around", style: {
      "line-color": t.accent, "line-style": "dashed", "line-dash-pattern": [2, 3],
      "line-opacity": 0.45, "source-arrow-color": t.accent, "target-arrow-color": t.accent,
    } },
    { selector: "edge.hub-edge", style: { width: 2, "line-opacity": 0.8, "line-dash-pattern": [6, 4] } },
    { selector: "edge.hub-edge[label]", style: { label: "data(label)", "font-family": sans, "font-size": 8,
      color: t.muted, "text-rotation": "autorotate", "text-background-color": t.surface,
      "text-background-opacity": 0.85, "text-background-padding": 2 } },
    { selector: "edge:selected", style: { width: 3, "line-opacity": 1 } },
  ];
}

// fcose can leave compound cards overlapping on big graphs: push top-level boxes apart.
function separate(cy, nodes, margin = 18, pinned = () => false) {
  const items = nodes.map((n) => ({ n, b: n.boundingBox({ includeLabels: true }), dx: 0, dy: 0,
    fixed: n.data("kind") === "search" || pinned(n) }));
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (a.fixed && b.fixed) continue;
        const ox = Math.min(a.b.x2 + a.dx, b.b.x2 + b.dx) - Math.max(a.b.x1 + a.dx, b.b.x1 + b.dx) + margin;
        const oy = Math.min(a.b.y2 + a.dy, b.b.y2 + b.dy) - Math.max(a.b.y1 + a.dy, b.b.y1 + b.dy) + margin;
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const ax = (a.b.x1 + a.b.x2) / 2 + a.dx;
        const bx = (b.b.x1 + b.b.x2) / 2 + b.dx;
        const ay = (a.b.y1 + a.b.y2) / 2 + a.dy;
        const by = (b.b.y1 + b.b.y2) / 2 + b.dy;
        const [sa, sb] = a.fixed ? [0, 1] : b.fixed ? [1, 0] : [0.5, 0.5];
        if (ox < oy) {
          const d = (bx >= ax ? 1 : -1) * ox;
          a.dx -= d * sa; b.dx += d * sb;
        } else {
          const d = (by >= ay ? 1 : -1) * oy;
          a.dy -= d * sa; b.dy += d * sb;
        }
      }
    }
    if (!moved) break;
  }
  cy.batch(() => items.forEach(({ n, dx, dy }) => {
    if (dx || dy) (n.isParent() ? n.descendants() : n).shift({ x: dx, y: dy });
  }));
}

const isWeak = (n) => n.id() === WEAK || n.data("parent") === WEAK;

// A person's photo: a round <img> laid over the canvas just left of the card's name. Drawn by the
// browser, not by Cytoscape, whose image textures came out shifted at some zoom levels.
function placeAvatars(cy, layer) {
  if (!layer) return;
  const zoom = cy.zoom();
  const pan = cy.pan();
  const seen = new Set();
  cy.nodes("[kind = 'person'][avatar]").forEach((person) => {
    const id = person.id();
    seen.add(id);
    let img = layer.querySelector(`img[data-of="${CSS.escape(id)}"]`);
    if (!img) {
      img = document.createElement("img");
      img.className = "graph-avatar";
      img.alt = "";
      img.dataset.of = id;
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => { img.dataset.broken = "1"; img.hidden = true; });
      layer.append(img);
    }
    if (img.getAttribute("src") !== person.data("avatar")) {
      delete img.dataset.broken;
      img.src = person.data("avatar");
    }
    const size = parseFloat(person.style("font-size"));
    const tooSmall = size * zoom < 6 || person.hidden?.() || person.style("display") === "none";
    img.hidden = Boolean(img.dataset.broken) || tooSmall;
    if (img.hidden) return;
    const bb = person.boundingBox({ includeLabels: false, includeOverlays: false });
    const font = `${person.style("font-weight")} ${size}px ${person.style("font-family")}`;
    const left = (bb.x1 + bb.x2) / 2 + (AVATAR + AVATAR_GAP) / 2 - textWidth(person.data("label"), font) / 2;
    const x = (left - AVATAR_GAP - AVATAR / 2) * zoom + pan.x;
    const y = (bb.y1 - 8 - size / 2) * zoom + pan.y;
    const d = AVATAR * zoom;
    img.style.width = `${d}px`;
    img.style.height = `${d}px`;
    img.style.borderWidth = `${Math.max(1, 1.5 * zoom)}px`;
    img.style.opacity = person.hasClass("faded") ? "0.18" : "";
    img.style.transform = `translate(${x - d / 2}px, ${y - d / 2}px)`;
  });
  layer.querySelectorAll("img").forEach((img) => { if (!seen.has(img.dataset.of)) img.remove(); });
}

function forces(cy) {
  const big = cy.nodes().length > 150;
  return {
    name: "fcose", animate: false, quality: "default", padding: PAD,
    nodeDimensionsIncludeLabels: true, uniformNodeDimensions: false,
    nodeRepulsion: (n) => (n.data("kind") === "fact" || n.data("kind") === "close" ? 2500 : 6500),
    idealEdgeLength: (e) => (e.hasClass("hub-edge") ? 170 : e.hasClass("root") ? (e.hasClass("sub") ? 140 : big ? 260 : 190)
      : e.hasClass("shared") ? 45 : e.hasClass("around") ? 55 : e.hasClass("cross") ? 160 : 75),
    edgeElasticity: (e) => (e.hasClass("root") ? 0.08 : 0.45),
    nestingFactor: 0.1, gravity: 0.25, gravityRange: 3.8, gravityCompound: 1.2, gravityRangeCompound: 1.5,
    numIter: big ? 1500 : 2500, nodeSeparation: 90,
  };
}

function layout(cy) {
  const weak = cy.nodes().filter(isWeak);
  const rest = cy.elements().not(weak).not(weak.connectedEdges());
  rest.layout({
    ...forces(cy), randomize: true, packComponents: true,
    tile: true, tilingPaddingVertical: 24, tilingPaddingHorizontal: 24,
  }).run();
  // Portrait screens (mobile): turn a wide layout upright so it fills the stage.
  const box = rest.boundingBox();
  if (cy.height() > cy.width() && box.w > box.h * 1.2) {
    cy.batch(() => rest.nodes().filter((n) => !n.isParent()).positions((n) => ({ x: n.position("y"), y: n.position("x") })));
  }
  separate(cy, cy.nodes().orphans().filter((n) => !isWeak(n)));
  const hits = cy.getElementById(WEAK).children();
  if (hits.empty()) return;
  // Unverified hits go in a grid beside the graph (below it on portrait screens).
  const bb = rest.nonempty() ? rest.boundingBox() : { x1: 0, x2: 0, y1: 0, y2: 0, w: 0, h: 0 };
  const below = cy.height() > cy.width();
  const gap = 22;
  const cols = below ? Math.max(4, Math.floor(Math.max(bb.w, 4 * gap) / gap))
    : Math.max(4, Math.ceil(Math.sqrt(hits.length)));
  const rows = Math.ceil(hits.length / cols);
  const x0 = below ? bb.x1 + Math.max(0, (bb.w - (cols - 1) * gap) / 2) : bb.x2 + 140;
  const y0 = below ? bb.y2 + 110 : bb.y1 + Math.max(0, (bb.h - rows * gap) / 2);
  hits.positions((_, i) => ({ x: x0 + (i % cols) * gap, y: y0 + Math.floor(i / cols) * gap }));
}

const leaves = (eles) => eles.nodes().filter((n) => !n.isParent());

// A filter changed on the same search: add and remove only what changed. Nodes already on the
// graph never move (user drags included); a node shown again goes back where it was; only
// nodes never placed before get a spot, found by fcose with every other node pinned.
function update(cy, elements, placed) {
  leaves(cy.elements()).forEach((n) => { placed.set(n.id(), { ...n.position() }); });
  const wanted = new Map(elements.map((e) => [e.data.id, e]));
  const fresh = elements.filter((e) => cy.getElementById(e.data.id).empty());
  cy.batch(() => {
    cy.elements().filter((e) => !wanted.has(e.id())).remove();
    cy.elements().forEach((ele) => {
      const { id, source, target, parent, ...data } = wanted.get(ele.id()).data;
      ele.data(data);
      ele.classes(wanted.get(ele.id()).classes || "");
    });
  });
  if (!fresh.length) return;
  const added = cy.add(fresh);
  added.edges(".root, .around, .shared, .cross").unselectify();
  const known = leaves(added).filter((n) => placed.has(n.id()));
  known.forEach((n) => { n.position(placed.get(n.id())); });
  const unknown = leaves(added).not(known);
  if (unknown.empty()) return;
  const pinned = leaves(cy.elements()).not(unknown);
  // Start each new node beside what it is tied to: outside a person's card, among accounts.
  const centre = cy.getElementById("search");
  unknown.forEach((n, i) => {
    const parent = n.parent();
    let near = n.neighborhood().nodes().not(unknown);
    if (near.empty() && parent.nonempty()) near = parent.neighborhood().nodes().not(unknown).not(parent);
    if (near.empty() && parent.empty()) return;
    const box = (near.nonempty() ? near : parent).boundingBox();
    const cx = (box.x1 + box.x2) / 2;
    const cyy = (box.y1 + box.y2) / 2;
    const outside = near.some((m) => m.isParent());
    const from = centre.nonempty() && outside ? centre.position() : { x: cx, y: cyy - 1 };
    const angle = Math.atan2(cyy - from.y, cx - from.x) + ((i % 7) - 3) * 0.35;
    const r = outside ? Math.max(box.w, box.h) / 2 + 70 : 25;
    n.position({ x: cx + Math.cos(angle) * r, y: cyy + Math.sin(angle) * r });
  });
  const fixed = pinned.map((n) => ({ nodeId: n.id(), position: { ...n.position() } }));
  cy.elements().not(cy.nodes().filter(isWeak)).layout({
    ...forces(cy), randomize: false, packComponents: false, tile: false, fixedNodeConstraint: fixed,
  }).run();
  // fcose keeps pinned nodes in place up to rounding: put them back exactly.
  cy.batch(() => fixed.forEach(({ nodeId, position }) => cy.getElementById(nodeId).position(position)));
  // A whole new card (a search around just finished) can land on others: push only the new ones.
  const kept = new Set(fixed.map((f) => f.nodeId));
  const top = cy.nodes().orphans().filter((n) => !isWeak(n));
  if (top.some((n) => n.isParent() && !leaves(n.descendants()).some((c) => kept.has(c.id())))) {
    separate(cy, top, 18, (n) => (n.isParent() ? leaves(n.descendants()) : n).some((c) => kept.has(c.id())));
  }
}

// Part of the stage not covered by the details panel, so focus lands in the visible area.
function visibleArea(root) {
  const w = root.offsetWidth;
  const h = root.offsetHeight;
  const panel = root.parentElement?.querySelector(":scope > .details");
  if (!panel) return { x: 0, y: 0, w, h };
  const box = root.getBoundingClientRect();
  const p = panel.getBoundingClientRect();
  const left = p.left - box.left;
  const top = p.top - box.top;
  if (p.width < w * 0.8 && left > w * 0.3) return { x: 0, y: 0, w: left, h };
  if (top > h * 0.2) return { x: 0, y: 0, w, h: Math.min(h, top) };
  return { x: 0, y: 0, w, h };
}

function moveTo(cy, viewport) {
  cy.stop();
  if (reducedMotion()) cy.viewport(viewport);
  else cy.animate(viewport, { duration: 420, easing: "ease-in-out-cubic" });
}

function focusOn(cy, root, ele) {
  const target = ele.id() === "search" ? cy.elements() : ele.union(ele.descendants());
  const bb = target.boundingBox();
  const area = visibleArea(root);
  const fit = Math.min((area.w - 2 * PAD) / Math.max(bb.w, 1), (area.h - 2 * PAD) / Math.max(bb.h, 1));
  const zoom = Math.max(cy.minZoom(), Math.min(fit, MAX_FOCUS_ZOOM));
  const cx = bb.x1 + bb.w / 2;
  const cyy = bb.y1 + bb.h / 2;
  moveTo(cy, { zoom, pan: { x: area.x + area.w / 2 - cx * zoom, y: area.y + area.h / 2 - cyy * zoom } });
}

export default function Graph({ elements, layoutKey, onSelect, focusId, highlight = null }) {
  const root = useRef(null);
  const box = useRef(null);
  const cyRef = useRef(null);
  const selectRef = useRef(onSelect);
  const focusRef = useRef({ id: focusId, shown: null });
  const keyRef = useRef(null);
  const placed = useRef(new Map());  // last position of every node, kept while filters change
  const avatars = useRef(null);
  const shownHighlight = useRef(null);
  selectRef.current = onSelect;

  useEffect(() => () => { cyRef.current?.destroy(); cyRef.current = null; }, []);

  useEffect(() => {
    if (!elements) return;
    if (cyRef.current && keyRef.current === layoutKey) {
      update(cyRef.current, elements, placed.current);
      placeAvatars(cyRef.current, avatars.current);
      return;
    }
    cyRef.current?.destroy();
    avatars.current?.replaceChildren();
    keyRef.current = layoutKey;
    placed.current = new Map();
    const tokens = readTokens();
    const cy = cytoscape({
      container: box.current, elements, style: buildStyle(tokens), wheelSensitivity: 0.3,
      minZoom: 0.08, maxZoom: 3, boxSelectionEnabled: false, selectionType: "single",
    });
    cyRef.current = cy;
    layout(cy);
    // Structural edges lead to their node: tapping one opens that node, never an empty panel.
    cy.edges(".root, .around, .shared, .cross").unselectify();
    cy.fit(undefined, PAD);
    if (cy.zoom() > MAX_FOCUS_ZOOM) cy.zoom({ level: MAX_FOCUS_ZOOM, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    focusRef.current.shown = null;

    // Photos follow their card: pan, zoom, drag, layout, class changes (one update per burst of events).
    let queued = false;
    const follow = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; if (!cy.destroyed()) placeAvatars(cy, avatars.current); });
    };
    cy.on("viewport position style add remove data", follow);
    follow();
    cy.on("tap", (e) => {
      cy.nodes(".hover").removeClass("hover");
      let ele = e.target;
      // A finished search around: its node shows or hides what it found, nothing else.
      if (ele !== cy && ele.data("kind") === "hub" && ele.data("status") === "done") {
        selectRef.current({ ...ele.data(), toggle: true });
        return;
      }
      if (ele !== cy && ele.isEdge() && !ele.data("link")) ele = ele.hasClass("shared") ? ele.source() : ele.target();
      cy.elements(":selected").not(ele === cy ? cy.collection() : ele).unselect();
      if (ele === cy) { selectRef.current(null); return; }
      ele.select();
      selectRef.current(ele.data());
    });
    cy.on("mouseover", "node", (e) => { e.target.addClass("hover"); box.current.style.cursor = "pointer"; });
    cy.on("mouseout", "node", (e) => { e.target.removeClass("hover"); box.current.style.cursor = ""; });

    const fonts = document.fonts;
    if (fonts?.load) {
      Promise.all([fonts.load(`700 13px ${tokens["font-sans"]}`), fonts.load(`500 10px ${tokens["font-mono"]}`)])
        .then(() => { if (!cy.destroyed()) cy.style().update(); }).catch(() => {});
    }
    if (!reducedMotion()) {
      box.current.animate?.([{ opacity: 0, transform: "scale(0.985)" }, { opacity: 1, transform: "none" }],
        { duration: 450, easing: tokens.ease || "ease-out" });
    }
    if (import.meta.env.DEV) window.cy = cy;  // handy for debugging from the console
  }, [elements, layoutKey]);

  // A search around that runs: its hub breathes and its edge flows towards it.
  useEffect(() => {
    if (reducedMotion()) return undefined;
    let tick = 0;
    const timer = setInterval(() => {
      const cy = cyRef.current;
      if (!cy || cy.destroyed()) return;
      tick += 1;
      const edges = cy.edges(".hub-edge.running");
      if (edges.nonempty()) edges.style("line-dash-offset", -tick);
      if (tick % 14 === 0) cy.nodes("[kind = 'hub'].running, node.lit").toggleClass("pulse");
    }, 50);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const state = focusRef.current;
    const changed = state.id !== focusId || state.shown === null;
    const animate = state.id !== focusId;
    state.id = focusId;
    state.shown = elements;
    if (!changed) return;
    const ele = focusId ? cy.getElementById(focusId) : cy.collection();
    cy.elements(":selected").not(ele).unselect();
    if (ele.empty()) return;
    ele.select();
    if (animate) focusOn(cy, root.current, ele);
  }, [focusId, elements]);

  // Light up the accounts a detail comes from, dim the rest, and bring them into view.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => { cy.elements(".lit, .faded").removeClass("lit faded pulse"); });
    if (!highlight?.length) { shownHighlight.current = highlight; return; }
    const lit = cy.collection(highlight.map((id) => cy.getElementById(id)).filter((n) => n.nonempty()));
    if (lit.empty()) return;
    const keep = lit.union(lit.ancestors()).union(lit.edgesWith(lit));
    cy.batch(() => {
      lit.addClass("lit");
      cy.elements().not(keep).filter((e) => e.isEdge() || !e.isParent()).addClass("faded");
    });
    if (shownHighlight.current !== highlight) focusOn(cy, root.current, lit.union(lit.ancestors()));
    shownHighlight.current = highlight;
  }, [highlight, elements]);

  const zoomBy = (factor) => {
    const cy = cyRef.current;
    if (!cy) return;
    const zoom = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor));
    const c = { x: cy.width() / 2, y: cy.height() / 2 };
    const pan = cy.pan();
    const k = zoom / cy.zoom();
    moveTo(cy, { zoom, pan: { x: c.x - (c.x - pan.x) * k, y: c.y - (c.y - pan.y) * k } });
  };
  const fitAll = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.stop();
    if (reducedMotion()) cy.fit(undefined, PAD);
    else cy.animate({ fit: { eles: cy.elements(), padding: PAD } }, { duration: 420, easing: "ease-in-out-cubic" });
  };

  return (
    <div className="graph" ref={root}>
      <div className="graph-canvas" ref={box} role="img" aria-label="Graph of the people and accounts found" />
      <div className="graph-avatars" ref={avatars} aria-hidden="true" />
      <div className="graph-zoom" role="group" aria-label="Zoom">
        <button type="button" onClick={() => zoomBy(1 / 1.3)} aria-label="Zoom out" title="Zoom out">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" /></svg>
        </button>
        <button type="button" onClick={() => zoomBy(1.3)} aria-label="Zoom in" title="Zoom in">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" /></svg>
        </button>
        <button type="button" onClick={fitAll} aria-label="Fit graph to screen" title="Fit">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 3.5h3v3M6.5 12.5h-3v-3M12.5 3.5 9 7M3.5 12.5 7 9" /></svg>
        </button>
      </div>
    </div>
  );
}
