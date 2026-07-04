/**
 * Declarative first-person 3D scene specs (D10).
 *
 * A scene = mood + room + props + NPC + two cameras (fpv / third).
 * Adding a new 3D scene is ONE entry here; unknown scene ids get a synthesized
 * generic spec from location/visualCues, so every scene always renders.
 *
 * Environment (floor/walls/furniture) is real geometry; characters and small
 * objects are emoji billboards placed in 3D space — this keeps the warm,
 * crafted look of the product while giving true first-person depth.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type PropAnim = "bob" | "rise" | "walk" | "sway" | null;

export interface PropSpec {
  kind: "emoji" | "box" | "textboard";
  /** Emoji glyph (kind=emoji) or board lines (kind=textboard). */
  glyph?: string;
  lines?: string[];
  position: Vec3;
  /** World size: emoji sprite height / box [w,h,d] via size+depth. */
  size: number;
  depth?: number;
  width?: number;
  color?: string;
  /** Seconds before the prop appears (staged entrance). */
  appearAt?: number;
  anim?: PropAnim;
  /** walk anim: oscillates along x by this amplitude. */
  walkAmp?: number;
  /** Visible only in the third-person (PiP) view. */
  thirdOnly?: boolean;
}

export interface SceneSpec3D {
  /** Sky/fog backdrop and lighting mood. */
  background: string;
  fog?: { color: string; near: number; far: number };
  ambientColor: string;
  ambientIntensity: number;
  keyLight: { color: string; intensity: number; position: Vec3 };
  room: {
    width: number;
    depth: number;
    floorColor: string;
    wallColor: string | null; // null = open air (street)
    wallHeight?: number;
  };
  props: PropSpec[];
  npc: {
    glyph: string;
    position: Vec3;
    size: number;
    anim: PropAnim;
  } | null;
  /** Learner avatar shown ONLY in the third-person wipe view. */
  avatar: { glyph: string; size: number };
  fpv: { position: Vec3; lookAt: Vec3 };
  third: { position: Vec3; lookAt: Vec3 };
}

const CAFE: SceneSpec3D = {
  background: "#2a1d16",
  fog: { color: "#2a1d16", near: 6, far: 16 },
  ambientColor: "#ffd9a8",
  ambientIntensity: 0.9,
  keyLight: { color: "#ffb066", intensity: 1.1, position: { x: 2, y: 4, z: 3 } },
  room: { width: 8, depth: 10, floorColor: "#3d2b1f", wallColor: "#4a3527" },
  props: [
    { kind: "box", position: { x: 0, y: 0.55, z: -1.6 }, size: 1.1, width: 4.4, depth: 0.9, color: "#5c4030", appearAt: 0 },
    { kind: "textboard", lines: ["MENU", "☕ coffee · 3.50", "🥐 croissant · 2.80"], position: { x: -1.7, y: 2.15, z: -2.4 }, size: 1.25, width: 1.5, color: "#33241a", appearAt: 0.2 },
    { kind: "emoji", glyph: "☕", position: { x: 0.85, y: 1.32, z: -1.5 }, size: 0.4, appearAt: 0.9 },
    { kind: "emoji", glyph: "〜", position: { x: 0.85, y: 1.7, z: -1.5 }, size: 0.28, appearAt: 1.4, anim: "rise" },
    { kind: "emoji", glyph: "🧁", position: { x: 1.6, y: 1.32, z: -1.55 }, size: 0.38, appearAt: 1.1 },
    { kind: "emoji", glyph: "🧍", position: { x: 1.1, y: 0.95, z: 3.4 }, size: 1.7, appearAt: 2.6, anim: "sway", thirdOnly: false },
  ],
  npc: { glyph: "🧑‍🍳", position: { x: 0, y: 1.65, z: -2.1 }, size: 1.9, anim: "bob" },
  avatar: { glyph: "🧍", size: 1.8 },
  fpv: { position: { x: 0, y: 1.55, z: 1.4 }, lookAt: { x: 0, y: 1.5, z: -2.1 } },
  third: { position: { x: 3.4, y: 2.4, z: 4.6 }, lookAt: { x: 0.1, y: 1.2, z: -0.6 } },
};

const DINING: SceneSpec3D = {
  background: "#221a12",
  fog: { color: "#221a12", near: 7, far: 18 },
  ambientColor: "#ffe3b3",
  ambientIntensity: 0.95,
  keyLight: { color: "#ff9d5c", intensity: 1.0, position: { x: -2, y: 4, z: 2 } },
  room: { width: 10, depth: 12, floorColor: "#33261a", wallColor: "#402e20" },
  props: [
    // My table, right in front of the FPV camera — the empty plate is the wound.
    { kind: "box", position: { x: 0, y: 0.45, z: 0.1 }, size: 0.9, width: 1.7, depth: 1.1, color: "#4a3628", appearAt: 0 },
    { kind: "emoji", glyph: "🍽️", position: { x: 0, y: 1.05, z: 0.1 }, size: 0.5, appearAt: 0.8 },
    { kind: "emoji", glyph: "🥄", position: { x: 0.45, y: 1.0, z: 0.25 }, size: 0.3, appearAt: 0.9 },
    // Neighbor tables that DO get food — placed inside the FPV frame so the
    // contrast with the learner's empty plate is felt, not explained.
    { kind: "box", position: { x: -1.9, y: 0.45, z: -2.2 }, size: 0.9, width: 1.6, depth: 1.0, color: "#463225", appearAt: 0 },
    { kind: "emoji", glyph: "🧑", position: { x: -2.45, y: 1.25, z: -2.4 }, size: 1.4, appearAt: 0.3 },
    { kind: "emoji", glyph: "🍝", position: { x: -1.7, y: 1.1, z: -2.2 }, size: 0.45, appearAt: 1.3 },
    { kind: "box", position: { x: 2.0, y: 0.45, z: -2.6 }, size: 0.9, width: 1.6, depth: 1.0, color: "#463225", appearAt: 0 },
    { kind: "emoji", glyph: "👩", position: { x: 2.55, y: 1.25, z: -2.8 }, size: 1.4, appearAt: 0.6 },
    { kind: "emoji", glyph: "🍛", position: { x: 1.8, y: 1.1, z: -2.6 }, size: 0.45, appearAt: 2.5 },
    // The server passing by — the short window to call out.
    { kind: "emoji", glyph: "🚶", position: { x: 0, y: 1.3, z: -2.6 }, size: 1.6, appearAt: 0.2, anim: "walk", walkAmp: 3.2 },
  ],
  npc: null,
  avatar: { glyph: "🧍", size: 1.8 },
  fpv: { position: { x: 0, y: 1.5, z: 2.0 }, lookAt: { x: 0, y: 0.95, z: -2.4 } },
  third: { position: { x: 4.0, y: 2.6, z: 4.4 }, lookAt: { x: 0, y: 1.0, z: -0.4 } },
};

const SERVICE: SceneSpec3D = {
  background: "#1d2126",
  fog: { color: "#1d2126", near: 6, far: 15 },
  ambientColor: "#cfe0ff",
  ambientIntensity: 0.8,
  keyLight: { color: "#ffffff", intensity: 1.0, position: { x: 1, y: 4, z: 3 } },
  room: { width: 8, depth: 9, floorColor: "#2b3038", wallColor: "#353c46" },
  props: [
    { kind: "box", position: { x: 0, y: 0.55, z: -1.5 }, size: 1.1, width: 4.2, depth: 0.8, color: "#454d59", appearAt: 0 },
    { kind: "emoji", glyph: "🧾", position: { x: 0.8, y: 1.5, z: -1.6 }, size: 0.45, appearAt: 0.9, anim: "sway" },
    { kind: "emoji", glyph: "🛒", position: { x: -2.4, y: 0.8, z: -0.5 }, size: 1.0, appearAt: 0.4 },
  ],
  npc: { glyph: "🧑‍💼", position: { x: 0, y: 1.65, z: -2.0 }, size: 1.9, anim: "bob" },
  avatar: { glyph: "🧍", size: 1.8 },
  fpv: { position: { x: 0, y: 1.55, z: 1.4 }, lookAt: { x: 0, y: 1.5, z: -2.0 } },
  third: { position: { x: -3.4, y: 2.4, z: 4.4 }, lookAt: { x: 0, y: 1.2, z: -0.6 } },
};

const STREET: SceneSpec3D = {
  background: "#20283b",
  fog: { color: "#20283b", near: 8, far: 26 },
  ambientColor: "#aebfe8",
  ambientIntensity: 0.85,
  keyLight: { color: "#f4e6c0", intensity: 0.9, position: { x: -3, y: 6, z: 2 } },
  room: { width: 7, depth: 26, floorColor: "#39404d", wallColor: null },
  props: [
    // Street buildings receding toward the unseen station.
    { kind: "box", position: { x: -3.3, y: 2.2, z: -4 }, size: 4.4, width: 2.2, depth: 3.4, color: "#2d3547", appearAt: 0 },
    { kind: "box", position: { x: 3.3, y: 1.8, z: -6 }, size: 3.6, width: 2.4, depth: 4.2, color: "#333c52", appearAt: 0 },
    { kind: "box", position: { x: -3.1, y: 1.5, z: -10 }, size: 3.0, width: 2.0, depth: 3.0, color: "#28304a", appearAt: 0 },
    { kind: "textboard", lines: ["🚉 ?"], position: { x: 2.2, y: 2.6, z: -11 }, size: 1.1, width: 1.3, color: "#1f2739", appearAt: 1.2 },
    { kind: "emoji", glyph: "🗺️", position: { x: -0.55, y: 1.05, z: 0.7 }, size: 0.5, appearAt: 0.6, thirdOnly: true },
  ],
  npc: { glyph: "🚶", position: { x: 0.4, y: 1.6, z: -3.2 }, size: 1.8, anim: "bob" },
  avatar: { glyph: "🧍", size: 1.8 },
  fpv: { position: { x: 0, y: 1.55, z: 1.2 }, lookAt: { x: 0.3, y: 1.4, z: -4 } },
  third: { position: { x: 3.6, y: 2.8, z: 4.8 }, lookAt: { x: 0.2, y: 1.2, z: -1.2 } },
};

const HOTEL: SceneSpec3D = {
  background: "#241f2c",
  fog: { color: "#241f2c", near: 6, far: 16 },
  ambientColor: "#ffe9c9",
  ambientIntensity: 0.8,
  keyLight: { color: "#ffd28a", intensity: 1.05, position: { x: 0, y: 5, z: 3 } },
  room: { width: 9, depth: 11, floorColor: "#3a3040", wallColor: "#463a4e" },
  props: [
    { kind: "box", position: { x: 0, y: 0.6, z: -1.7 }, size: 1.2, width: 4.6, depth: 0.9, color: "#57465f", appearAt: 0 },
    { kind: "textboard", lines: ["RECEPTION"], position: { x: 0, y: 2.5, z: -2.6 }, size: 0.8, width: 2.6, color: "#2e2635", appearAt: 0.3 },
    { kind: "emoji", glyph: "🔔", position: { x: 1.2, y: 1.42, z: -1.6 }, size: 0.34, appearAt: 1.0 },
    { kind: "emoji", glyph: "🪴", position: { x: -3.2, y: 1.0, z: -1.0 }, size: 1.4, appearAt: 0.5 },
    { kind: "emoji", glyph: "🧳", position: { x: 0.9, y: 0.55, z: 1.1 }, size: 0.9, appearAt: 0.8 },
  ],
  npc: { glyph: "💁", position: { x: 0, y: 1.7, z: -2.2 }, size: 1.9, anim: "bob" },
  avatar: { glyph: "🧍", size: 1.8 },
  fpv: { position: { x: 0, y: 1.55, z: 1.5 }, lookAt: { x: 0, y: 1.5, z: -2.2 } },
  third: { position: { x: -3.6, y: 2.5, z: 4.6 }, lookAt: { x: 0, y: 1.2, z: -0.6 } },
};

const SPECS: Record<string, SceneSpec3D> = {
  "cafe-order": CAFE,
  "missing-order": DINING,
  "did-not-understand": SERVICE,
  "asking-directions": STREET,
  "hotel-checkin": HOTEL,
};

/** Synthesized fallback so any future scene renders without a bespoke spec. */
function genericSpec(location: string, visualCues: string[], npcPresent: boolean): SceneSpec3D {
  const outdoor = /street|road|park|outside|station/i.test(location);
  const cueGlyph = (cue: string): string => {
    if (/menu/i.test(cue)) return "📋";
    if (/coffee|cafe/i.test(cue)) return "☕";
    if (/receipt/i.test(cue)) return "🧾";
    if (/food|plate|dish|table/i.test(cue)) return "🍽️";
    if (/bag|luggage/i.test(cue)) return "🧳";
    if (/desk|counter|clerk|front/i.test(cue)) return "🛎️";
    if (/people|customer|crowd|waiting|passerby/i.test(cue)) return "🧍";
    return "✨";
  };
  return {
    background: outdoor ? "#20283b" : "#26202a",
    fog: { color: outdoor ? "#20283b" : "#26202a", near: 6, far: 18 },
    ambientColor: "#e8d9c4",
    ambientIntensity: 0.8,
    keyLight: { color: "#ffe0a8", intensity: 1.0, position: { x: 1, y: 4, z: 3 } },
    room: {
      width: 8,
      depth: outdoor ? 22 : 10,
      floorColor: outdoor ? "#39404d" : "#3a2f36",
      wallColor: outdoor ? null : "#473a44",
    },
    props: visualCues.slice(0, 4).map((cue, i) => ({
      kind: "emoji" as const,
      glyph: cueGlyph(cue),
      position: { x: -1.8 + i * 1.2, y: 1.1, z: -1.4 - (i % 2) * 0.7 },
      size: 0.8,
      appearAt: 0.4 + i * 0.7,
    })),
    npc: npcPresent ? { glyph: "🧑", position: { x: 0, y: 1.6, z: -2.2 }, size: 1.9, anim: "bob" } : null,
    avatar: { glyph: "🧍", size: 1.8 },
    fpv: { position: { x: 0, y: 1.55, z: 1.4 }, lookAt: { x: 0, y: 1.4, z: -2.2 } },
    third: { position: { x: 3.4, y: 2.5, z: 4.6 }, lookAt: { x: 0, y: 1.2, z: -0.6 } },
  };
}

export function specFor(sceneId: string, location: string, visualCues: string[], npcPresent: boolean): SceneSpec3D {
  return SPECS[sceneId] ?? genericSpec(location, visualCues, npcPresent);
}
