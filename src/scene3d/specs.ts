/**
 * Declarative first-person 3D scene specs (D10).
 *
 * A scene = mood + room + props + NPC + two cameras (fpv / third).
 * Adding a new 3D scene is ONE entry here; unknown scene ids get a synthesized
 * generic spec from location/visualCues, so every scene always renders.
 *
 * Environment (floor/walls/furniture) is real geometry; small objects (cups,
 * plates, signs, plants, luggage, steam) are emoji billboards. People
 * (customers, staff, passersby, the learner's own avatar) are procedural
 * low-poly 3D humans (D13) — this keeps the warm, crafted look of the
 * product while giving true first-person depth and letting characters feel
 * present rather than flat.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type PropAnim = "bob" | "rise" | "walk" | "sway" | null;

/** How a procedural person idles while standing at their spot. */
export type PersonIdle = "breathe" | "walk";

/** Shared appearance fields for any procedural human (prop, npc, or avatar). */
export interface PersonAppearance {
  /** Free label (e.g. "cashier", "receptionist") — may hint accessories (chef/cook → hat). */
  role?: string;
  skinTone?: string;
  outfitColor: string;
  /** Apron / vest / hat-band accent color. */
  accentColor?: string;
  /** Y rotation radians; 0 = facing -z (into the room, matching camera default). */
  facing?: number;
}

export interface PropSpec {
  kind: "emoji" | "box" | "textboard" | "person";
  /** Emoji glyph (kind=emoji) or board lines (kind=textboard). */
  glyph?: string;
  lines?: string[];
  position: Vec3;
  /** World size: emoji sprite height / box [w,h,d] via size+depth / person standing height. */
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
  /** kind="person" appearance. */
  role?: string;
  skinTone?: string;
  outfitColor?: string;
  accentColor?: string;
  facing?: number;
  /** kind="person" idle animation (independent of the positional `anim`). */
  idle?: PersonIdle;
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
  npc:
    | (PersonAppearance & {
        position: Vec3;
        size: number;
        anim: PropAnim;
        idle: PersonIdle;
      })
    | null;
  /** Learner avatar shown ONLY in the third-person wipe view. */
  avatar: PersonAppearance & { size: number };
  fpv: { position: Vec3; lookAt: Vec3 };
  third: { position: Vec3; lookAt: Vec3 };
}

/** Neutral, reused across scenes so the learner's own look stays consistent. */
const AVATAR: PersonAppearance & { size: number } = {
  outfitColor: "#4a5568",
  accentColor: "#3a4152",
  skinTone: "#d9a878",
  size: 1.75,
};

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
    // Another customer waiting behind the learner — mostly a third-view detail.
    {
      kind: "person",
      position: { x: 1.1, y: 0, z: 3.4 },
      size: 1.65,
      appearAt: 2.6,
      idle: "breathe",
      outfitColor: "#5b7065",
      skinTone: "#c98f5e",
      facing: Math.PI * 0.15,
    },
  ],
  npc: {
    role: "cashier",
    skinTone: "#dba97c",
    outfitColor: "#f6f1e6",
    accentColor: "#a8542f",
    facing: Math.PI,
    position: { x: 0, y: 0, z: -2.1 },
    size: 1.78,
    anim: "bob",
    idle: "breathe",
  },
  avatar: AVATAR,
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
    // Neighbors are seated: shorter standing height + the table box in front
    // hides their legs, so only torso/head read as "seated" through the frame.
    { kind: "box", position: { x: -1.9, y: 0.45, z: -2.2 }, size: 0.9, width: 1.6, depth: 1.0, color: "#463225", appearAt: 0 },
    {
      kind: "person",
      position: { x: -2.45, y: 0, z: -2.4 },
      size: 1.3,
      appearAt: 0.3,
      idle: "breathe",
      outfitColor: "#6b4a3a",
      skinTone: "#dba97c",
      facing: Math.PI * 0.85,
    },
    { kind: "emoji", glyph: "🍝", position: { x: -1.7, y: 1.1, z: -2.2 }, size: 0.45, appearAt: 1.3 },
    { kind: "box", position: { x: 2.0, y: 0.45, z: -2.6 }, size: 0.9, width: 1.6, depth: 1.0, color: "#463225", appearAt: 0 },
    {
      kind: "person",
      position: { x: 2.55, y: 0, z: -2.8 },
      size: 1.3,
      appearAt: 0.6,
      idle: "breathe",
      outfitColor: "#7a3b52",
      skinTone: "#c98f5e",
      facing: Math.PI * 1.15,
    },
    { kind: "emoji", glyph: "🍛", position: { x: 1.8, y: 1.1, z: -2.6 }, size: 0.45, appearAt: 2.5 },
    // The server passing by — the short window to call out.
    {
      kind: "person",
      position: { x: 0, y: 0, z: -2.6 },
      size: 1.72,
      appearAt: 0.2,
      anim: "walk",
      walkAmp: 3.2,
      idle: "walk",
      outfitColor: "#2f3b4a",
      accentColor: "#c9a86a",
      skinTone: "#dba97c",
    },
  ],
  npc: null,
  avatar: AVATAR,
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
  npc: {
    role: "clerk",
    skinTone: "#c98f5e",
    outfitColor: "#1c2b4a",
    accentColor: "#c9a86a",
    facing: Math.PI,
    position: { x: 0, y: 0, z: -2.0 },
    size: 1.78,
    anim: "bob",
    idle: "breathe",
  },
  avatar: AVATAR,
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
  npc: {
    role: "passerby",
    skinTone: "#e0b48c",
    outfitColor: "#405066",
    accentColor: "#8a3b3b",
    facing: Math.PI, // faces the learner
    position: { x: 0.4, y: 0, z: -3.2 },
    size: 1.72,
    anim: null,
    idle: "walk",
  },
  avatar: AVATAR,
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
  npc: {
    role: "receptionist",
    skinTone: "#dba97c",
    outfitColor: "#5a3d63",
    accentColor: "#d4a24c",
    facing: Math.PI,
    position: { x: 0, y: 0, z: -2.2 },
    size: 1.78,
    anim: "bob",
    idle: "breathe",
  },
  avatar: AVATAR,
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
    npc: npcPresent
      ? {
          role: "attendant",
          skinTone: "#dba97c",
          outfitColor: "#5b6b73",
          accentColor: "#8a9aa3",
          facing: Math.PI,
          position: { x: 0, y: 0, z: -2.2 },
          size: 1.78,
          anim: "bob",
          idle: "breathe",
        }
      : null,
    avatar: AVATAR,
    fpv: { position: { x: 0, y: 1.55, z: 1.4 }, lookAt: { x: 0, y: 1.4, z: -2.2 } },
    third: { position: { x: 3.4, y: 2.5, z: 4.6 }, lookAt: { x: 0, y: 1.2, z: -0.6 } },
  };
}

export function specFor(sceneId: string, location: string, visualCues: string[], npcPresent: boolean): SceneSpec3D {
  return SPECS[sceneId] ?? genericSpec(location, visualCues, npcPresent);
}
