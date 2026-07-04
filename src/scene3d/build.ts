/**
 * Builds a THREE scene graph from a declarative SceneSpec3D.
 *
 * Layers: 0 = both views; 1 = third-person only (learner avatar, thirdOnly
 * props). The FPV camera sees layer 0; the wipe camera sees 0 and 1.
 */
import * as THREE from "three";
import type { PropSpec, SceneSpec3D } from "./specs";

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

  const place = (object: THREE.Object3D, prop: Pick<PropSpec, "position" | "appearAt" | "anim" | "walkAmp" | "thirdOnly">) => {
    object.position.set(prop.position.x, prop.position.y, prop.position.z);
    if (prop.thirdOnly) object.layers.set(THIRD_ONLY_LAYER);
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
    }
  }

  if (spec.npc) {
    const npc = makeSprite(spec.npc.glyph, spec.npc.size);
    track(npc.material.map as THREE.Texture);
    track(npc.material);
    place(npc, { position: spec.npc.position, anim: spec.npc.anim, appearAt: 0.3 });
  }

  // Learner avatar — where the FPV camera stands; wipe view only.
  const avatar = makeSprite(spec.avatar.glyph, spec.avatar.size);
  track(avatar.material.map as THREE.Texture);
  track(avatar.material);
  avatar.position.set(spec.fpv.position.x, spec.avatar.size / 2 + 0.05, spec.fpv.position.z);
  avatar.layers.set(THIRD_ONLY_LAYER);
  scene.add(avatar);

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
  }

  function dispose() {
    for (const item of disposables) item.dispose();
  }

  return { scene, fpvCamera, thirdCamera, tick, dispose };
}
