/**
 * Builds a THREE scene graph from a declarative SceneSpec3D.
 *
 * Layers: 0 = both views; 1 = third-person only (learner avatar, thirdOnly
 * props). The FPV camera sees layer 0; the wipe camera sees 0 and 1.
 */
import * as THREE from "three";
import type { PersonAppearance, PersonIdle, PropSpec, SceneSpec3D } from "./specs";

export const THIRD_ONLY_LAYER = 1;

interface Animated {
  object: THREE.Object3D;
  anim: NonNullable<PropSpec["anim"]>;
  baseX: number;
  baseY: number;
  walkAmp: number;
  phase: number;
}

interface Staged {
  object: THREE.Object3D;
  appearAt: number;
}

/** A procedural human's limbs, kept around so tick() can animate its idle. */
interface PersonRig {
  idle: PersonIdle;
  phase: number;
  torso: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
}

export interface BuiltScene {
  scene: THREE.Scene;
  fpvCamera: THREE.PerspectiveCamera;
  thirdCamera: THREE.PerspectiveCamera;
  /** Advance staged entrances + idle animations. t = seconds since (re)start. */
  tick(t: number): void;
  dispose(): void;
}

/** Draw an emoji into a square canvas texture (crisp at sprite scale). */
function emojiTexture(glyph: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = `${size * 0.8}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(glyph, size / 2, size / 2 + size * 0.04);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Draw a warm signboard with text lines (menu, reception sign …). */
function boardTexture(lines: string[], color: string): THREE.CanvasTexture {
  const w = 512;
  const h = 384;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255, 214, 150, 0.55)";
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = "#f5e3c2";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lineHeight = h / (lines.length + 1);
    lines.forEach((line, i) => {
      ctx.font = i === 0 ? "bold 64px serif" : "48px serif";
      ctx.fillText(line, w / 2, lineHeight * (i + 1));
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSprite(glyph: string, size: number): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: emojiTexture(glyph),
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size, size, 1);
  return sprite;
}

/** Small transparent canvas: two eyes + a gentle smile — warm, not creepy. */
function faceTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#2c2018";
    ctx.beginPath();
    ctx.ellipse(size * 0.36, size * 0.44, size * 0.05, size * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(size * 0.64, size * 0.44, size * 0.05, size * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a2a1c";
    ctx.lineWidth = size * 0.045;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(size * 0.5, size * 0.48, size * 0.2, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Procedural low-poly human: sphere head (with a small face texture), a
 * capsule torso, two arm capsules, two leg capsules, and an optional flat
 * accent (apron/vest) + hat hint for chef/cook/cashier roles. ~7-9 meshes,
 * all cheap (low segment counts) and deterministic (no randomness — pose
 * driven purely by t + a position-derived phase).
 */
function buildPerson(
  spec: PersonAppearance,
  size: number,
  faceMaterial: THREE.Material,
  track: <T extends { dispose(): void }>(item: T) => T,
): { group: THREE.Group; rig: Omit<PersonRig, "idle" | "phase"> } {
  const skin = spec.skinTone ?? "#dba97c";
  const outfit = spec.outfitColor;
  const accent = spec.accentColor ?? outfit;

  const skinMat = track(new THREE.MeshLambertMaterial({ color: skin }));
  const outfitMat = track(new THREE.MeshLambertMaterial({ color: outfit }));
  const accentMat = track(new THREE.MeshLambertMaterial({ color: accent }));

  const group = new THREE.Group();

  const headR = size * 0.11;
  const legLen = size * 0.42;
  const torsoLen = size * 0.32;
  const torsoR = size * 0.13;

  const legGeo = track(new THREE.CapsuleGeometry(size * 0.055, legLen * 0.8, 2, 5));
  const legL = new THREE.Mesh(legGeo, outfitMat);
  legL.position.set(-size * 0.07, legLen * 0.5, 0);
  const legR = new THREE.Mesh(legGeo, outfitMat);
  legR.position.set(size * 0.07, legLen * 0.5, 0);
  group.add(legL, legR);

  const torsoGeo = track(new THREE.CapsuleGeometry(torsoR, torsoLen * 0.55, 3, 6));
  const torso = new THREE.Mesh(torsoGeo, outfitMat);
  torso.position.set(0, legLen + torsoLen * 0.5, 0);
  group.add(torso);

  // Apron / vest accent — a thin plate on the front of the torso.
  const accentGeo = track(new THREE.BoxGeometry(torsoR * 1.5, torsoLen * 0.5, 0.03));
  const accentMesh = new THREE.Mesh(accentGeo, accentMat);
  accentMesh.position.set(0, legLen + torsoLen * 0.4, -torsoR * 0.85);
  group.add(accentMesh);

  const armGeo = track(new THREE.CapsuleGeometry(size * 0.045, torsoLen * 0.7, 2, 5));
  const armL = new THREE.Mesh(armGeo, skinMat);
  armL.position.set(-torsoR - size * 0.05, legLen + torsoLen * 0.38, 0);
  const armR = new THREE.Mesh(armGeo, skinMat);
  armR.position.set(torsoR + size * 0.05, legLen + torsoLen * 0.38, 0);
  group.add(armL, armR);

  const headGeo = track(new THREE.SphereGeometry(headR, 10, 8));
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.set(0, legLen + torsoLen + headR * 0.9, 0);
  group.add(head);

  const faceGeo = track(new THREE.PlaneGeometry(headR * 1.1, headR * 1.1));
  const face = new THREE.Mesh(faceGeo, faceMaterial);
  face.position.set(0, 0, -headR * 0.97);
  face.rotation.y = Math.PI;
  head.add(face);

  if (spec.role && /chef|cook|cashier|barista/i.test(spec.role)) {
    const hatGeo = track(new THREE.CylinderGeometry(headR * 0.85, headR * 0.95, headR * 0.6, 10));
    const hatMat = track(new THREE.MeshLambertMaterial({ color: "#f7f3ea" }));
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.set(0, headR * 1.05, 0);
    head.add(hat);
  }

  group.rotation.y = spec.facing ?? 0;

  return { group, rig: { torso, armL, armR, legL, legR } };
}

export function buildScene(spec: SceneSpec3D, aspect: number): BuiltScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(spec.background);
  if (spec.fog) scene.fog = new THREE.Fog(spec.fog.color, spec.fog.near, spec.fog.far);

  scene.add(new THREE.AmbientLight(spec.ambientColor, spec.ambientIntensity));
  const key = new THREE.DirectionalLight(spec.keyLight.color, spec.keyLight.intensity);
  key.position.set(spec.keyLight.position.x, spec.keyLight.position.y, spec.keyLight.position.z);
  scene.add(key);

  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Room: floor always; walls when indoors (back + sides).
  const { width, depth, floorColor, wallColor, wallHeight = 3.4 } = spec.room;
  const floor = new THREE.Mesh(
    track(new THREE.PlaneGeometry(width, depth)),
    track(new THREE.MeshLambertMaterial({ color: floorColor })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -depth / 2 + 4;
  scene.add(floor);

  if (wallColor) {
    const wallMaterial = track(new THREE.MeshLambertMaterial({ color: wallColor }));
    // Back wall sits at the FAR edge of the floor (floor spans center ± depth/2).
    const back = new THREE.Mesh(track(new THREE.PlaneGeometry(width, wallHeight)), wallMaterial);
    back.position.set(0, wallHeight / 2, floor.position.z - depth / 2);
    scene.add(back);
    const left = new THREE.Mesh(track(new THREE.PlaneGeometry(depth, wallHeight)), wallMaterial);
    left.rotation.y = Math.PI / 2;
    left.position.set(-width / 2, wallHeight / 2, floor.position.z);
    scene.add(left);
    const right = new THREE.Mesh(track(new THREE.PlaneGeometry(depth, wallHeight)), wallMaterial);
    right.rotation.y = -Math.PI / 2;
    right.position.set(width / 2, wallHeight / 2, floor.position.z);
    scene.add(right);
  }

  const animated: Animated[] = [];
  const staged: Staged[] = [];
  const personRigs: PersonRig[] = [];

  // Shared face (eyes + smile) material — identical for every person in this scene.
  const faceMaterial = track(
    new THREE.MeshBasicMaterial({ map: track(faceTexture()), transparent: true, depthWrite: false }),
  );

  const addPerson = (
    appearance: PersonAppearance,
    size: number,
    idle: PersonIdle | undefined,
    place2: (group: THREE.Group) => void,
  ) => {
    const { group, rig } = buildPerson(appearance, size, faceMaterial, track);
    place2(group);
    if (idle) {
      personRigs.push({ idle, phase: group.position.x * 1.7 + group.position.z, ...rig });
    }
    return group;
  };

  const place = (object: THREE.Object3D, prop: Pick<PropSpec, "position" | "appearAt" | "anim" | "walkAmp" | "thirdOnly">) => {
    object.position.set(prop.position.x, prop.position.y, prop.position.z);
    // traverse (not just the root) so group-based props (persons) hide fully — layers
    // are tested per-object during render, not inherited from the parent.
    if (prop.thirdOnly) object.traverse((node) => node.layers.set(THIRD_ONLY_LAYER));
    if (prop.appearAt && prop.appearAt > 0) {
      object.visible = false;
      staged.push({ object, appearAt: prop.appearAt });
    }
    if (prop.anim) {
      animated.push({
        object,
        anim: prop.anim,
        baseX: prop.position.x,
        baseY: prop.position.y,
        walkAmp: prop.walkAmp ?? 1,
        phase: prop.position.x * 1.7 + prop.position.z,
      });
    }
    scene.add(object);
  };

  for (const prop of spec.props) {
    if (prop.kind === "emoji" && prop.glyph) {
      const sprite = makeSprite(prop.glyph, prop.size);
      track(sprite.material.map as THREE.Texture);
      track(sprite.material);
      place(sprite, prop);
    } else if (prop.kind === "box") {
      const box = new THREE.Mesh(
        track(new THREE.BoxGeometry(prop.width ?? prop.size, prop.size, prop.depth ?? prop.size)),
        track(new THREE.MeshLambertMaterial({ color: prop.color ?? "#555555" })),
      );
      place(box, prop);
    } else if (prop.kind === "textboard" && prop.lines) {
      const texture = track(boardTexture(prop.lines, prop.color ?? "#33241a"));
      const board = new THREE.Mesh(
        track(new THREE.PlaneGeometry(prop.width ?? prop.size, prop.size)),
        track(new THREE.MeshBasicMaterial({ map: texture })),
      );
      place(board, prop);
    } else if (prop.kind === "person") {
      addPerson(
        { role: prop.role, skinTone: prop.skinTone, outfitColor: prop.outfitColor ?? "#5b6b73", accentColor: prop.accentColor, facing: prop.facing },
        prop.size,
        prop.idle,
        (group) => place(group, prop),
      );
    }
  }

  if (spec.npc) {
    const npc = spec.npc;
    addPerson({ role: npc.role, skinTone: npc.skinTone, outfitColor: npc.outfitColor, accentColor: npc.accentColor, facing: npc.facing }, npc.size, npc.idle, (group) =>
      place(group, { position: npc.position, anim: npc.anim, appearAt: 0.3 }),
    );
  }

  // Learner avatar — where the FPV camera stands; wipe view only.
  addPerson(spec.avatar, spec.avatar.size, "breathe", (group) => {
    group.position.set(spec.fpv.position.x, 0, spec.fpv.position.z);
    group.traverse((node) => node.layers.set(THIRD_ONLY_LAYER));
    scene.add(group);
  });

  const fpvCamera = new THREE.PerspectiveCamera(58, aspect, 0.1, 60);
  fpvCamera.position.set(spec.fpv.position.x, spec.fpv.position.y, spec.fpv.position.z);
  fpvCamera.lookAt(spec.fpv.lookAt.x, spec.fpv.lookAt.y, spec.fpv.lookAt.z);
  fpvCamera.layers.set(0);

  const thirdCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);
  thirdCamera.position.set(spec.third.position.x, spec.third.position.y, spec.third.position.z);
  thirdCamera.lookAt(spec.third.lookAt.x, spec.third.lookAt.y, spec.third.lookAt.z);
  thirdCamera.layers.enable(THIRD_ONLY_LAYER);

  function tick(t: number) {
    for (const item of staged) {
      if (!item.object.visible && t >= item.appearAt) item.object.visible = true;
    }
    for (const item of animated) {
      switch (item.anim) {
        case "bob":
          item.object.position.y = item.baseY + Math.sin(t * 1.6 + item.phase) * 0.045;
          break;
        case "sway":
          item.object.position.x = item.baseX + Math.sin(t * 1.1 + item.phase) * 0.06;
          break;
        case "rise": {
          const cycle = (t + item.phase) % 2.4;
          item.object.position.y = item.baseY + cycle * 0.28;
          const material = (item.object as THREE.Sprite).material as THREE.SpriteMaterial;
          material.opacity = Math.max(0, 1 - cycle / 2.4);
          break;
        }
        case "walk":
          item.object.position.x = item.baseX + Math.sin(t * 0.45 + item.phase) * item.walkAmp;
          break;
      }
    }
    for (const rig of personRigs) {
      if (rig.idle === "breathe") {
        const wobble = Math.sin(t * 1.3 + rig.phase);
        rig.torso.scale.y = 1 + wobble * 0.025;
        rig.armL.rotation.z = 0.06 + wobble * 0.05;
        rig.armR.rotation.z = -0.06 - wobble * 0.05;
      } else if (rig.idle === "walk") {
        const swing = Math.sin(t * 4 + rig.phase);
        rig.armL.rotation.x = swing * 0.5;
        rig.armR.rotation.x = -swing * 0.5;
        rig.legL.rotation.x = -swing * 0.5;
        rig.legR.rotation.x = swing * 0.5;
      }
    }
  }

  function dispose() {
    for (const item of disposables) item.dispose();
  }

  return { scene, fpvCamera, thirdCamera, tick, dispose };
}
