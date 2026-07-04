/**
 * Scene3D — first-person 3D stage with a third-person "wipe" (PiP) view.
 *
 * One WebGLRenderer, two scissored viewports:
 *   main   = FPV camera (the learner's own eyes — 状況を体感する)
 *   wipe   = third-person camera incl. the learner avatar (英文を考える視点)
 * Tapping the wipe toggles small ⇄ large.
 *
 * Loaded lazily (separate chunk); the caller falls back to the 2D stage when
 * WebGL is unavailable. Respects prefers-reduced-motion by rendering a few
 * static frames instead of a continuous loop.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Scene } from "../../shared/types";
import { buildScene } from "./build";
import { specFor } from "./specs";

interface Scene3DProps {
  scene: Scene;
  /** Bump to replay the staging from t=0 (the decisive moment). */
  replayKey?: number;
  /** Wipe expanded state is controlled here so the frame overlay can match. */
  onWipeToggle?(expanded: boolean): void;
  /** Renderer creation failed (no WebGL context) — caller should fall back to 2D. */
  onFailed?(): void;
}

export default function Scene3D({ scene, replayKey = 0, onWipeToggle, onFailed }: Scene3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [wipeExpanded, setWipeExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const wipeExpandedRef = useRef(wipeExpanded);
  wipeExpandedRef.current = wipeExpanded;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      setFailed(true);
      onFailed?.();
      return;
    }
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));

    const spec = specFor(scene.id, scene.location, scene.visualCues, scene.npcOpening !== null);
    const built = buildScene(spec, 16 / 9);

    const reducedMotion =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    const start = performance.now();
    let disposed = false;

    function render() {
      if (disposed) return;
      const t = (performance.now() - start) / 1000;
      built.tick(reducedMotion ? 10 : t); // reduced motion: staging fully "arrived", no idle loop

      const w = canvas!.clientWidth || 1;
      const h = canvas!.clientHeight || 1;
      if (canvas!.width !== Math.floor(w * renderer.getPixelRatio())) {
        renderer.setSize(w, h, false);
      }

      // Main FPV view.
      built.fpvCamera.aspect = w / h;
      built.fpvCamera.updateProjectionMatrix();
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      renderer.render(built.scene, built.fpvCamera);
      if ((globalThis as Record<string, unknown>).__S3D_DEBUG && !((globalThis as Record<string, unknown>).__S3D_LOGGED)) {
        (globalThis as Record<string, unknown>).__S3D_LOGGED = true;
        console.log("[s3d]", JSON.stringify({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, w, h, cam: built.fpvCamera.position.toArray() }));
      }

      // Third-person wipe, top-right.
      const scale = wipeExpandedRef.current ? 0.62 : 0.3;
      const pw = Math.floor(w * scale);
      const ph = Math.floor(pw * 0.68);
      const margin = 10;
      const x = w - pw - margin;
      const y = h - ph - margin; // GL viewport origin = bottom-left
      built.thirdCamera.aspect = pw / ph;
      built.thirdCamera.updateProjectionMatrix();
      renderer.setScissorTest(true);
      renderer.setScissor(x, y, pw, ph);
      renderer.setViewport(x, y, pw, ph);
      renderer.render(built.scene, built.thirdCamera);
      renderer.setScissorTest(false);

      if (!reducedMotion) raf = requestAnimationFrame(render);
    }

    if (reducedMotion) {
      // Render once now and once after fonts/emoji settle.
      render();
      const settle = setTimeout(render, 350);
      return () => {
        clearTimeout(settle);
        disposed = true;
        built.dispose();
        renderer.dispose();
      };
    }

    raf = requestAnimationFrame(render);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      built.dispose();
      renderer.dispose();
    };
  }, [scene.id, scene.location, scene.npcOpening, scene.visualCues, replayKey]);

  if (failed) return null;

  const toggleWipe = () => {
    setWipeExpanded((v) => {
      onWipeToggle?.(!v);
      return !v;
    });
  };

  return (
    <div className="s3d-wrap">
      <canvas ref={canvasRef} className="s3d-canvas" aria-hidden />
      <button
        type="button"
        className={`s3d-wipe-hit${wipeExpanded ? " s3d-wipe-hit-big" : ""}`}
        aria-label={wipeExpanded ? "三人称ビューを小さくする" : "三人称ビューを大きくする"}
        title="三人称ビュー(自分を外から見る)"
        onClick={toggleWipe}
      />
    </div>
  );
}
