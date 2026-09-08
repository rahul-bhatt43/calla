"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NsfwResponse } from "@/workers/nsfw.worker";

/** Score above which a single frame counts as explicit. */
const THRESHOLD = 0.6;
/** Consecutive breaches required before blurring. */
const STRIKES_TO_BLUR = 2;
const SAMPLE_INTERVAL_MS = 3000;
/** Downscaled before classification — the model works at 224px anyway. */
const SAMPLE_SIZE = 224;

export interface NsfwGuard {
  blurred: boolean;
  available: boolean;
  /** Clears the blur for the current partner only; resets on the next match. */
  dismiss: () => void;
  reset: () => void;
  /** Grabs the current remote frame as a base64 JPEG, for report evidence. */
  captureFrame: () => string | null;
}

/**
 * Samples the *remote* video every few seconds and blurs it if the on-device
 * classifier repeatedly flags it.
 *
 * Requiring consecutive strikes rather than acting on one frame matters: a
 * single frame of someone changing a shirt, or a bad crop, will trip any
 * classifier, and a product that blurs innocent people constantly gets its
 * safety features turned off by users. Two in a row is a much stronger signal
 * at a barely noticeable cost in latency.
 */
export function useNsfwGuard(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
): NsfwGuard {
  const [blurred, setBlurred] = useState(false);
  const [available, setAvailable] = useState(false);
  const dismissedRef = useRef(false);
  const strikesRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);
  const seqRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (!("createImageBitmap" in window) || !("Worker" in window)) return;

    const worker = new Worker(
      new URL("../workers/nsfw.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<NsfwResponse>) => {
      const msg = e.data;
      if (msg.type === "ready") setAvailable(true);
      if (msg.type === "unavailable") {
        setAvailable(false);
        console.warn(
          `[nsfw] classifier unavailable (${msg.reason}). ` +
            `Run \`node scripts/fetch-nsfw-model.mjs\` to vendor the weights.`,
        );
      }
      if (msg.type === "result") {
        if (msg.explicitScore >= THRESHOLD) {
          strikesRef.current += 1;
          if (strikesRef.current >= STRIKES_TO_BLUR && !dismissedRef.current) {
            setBlurred(true);
          }
        } else {
          strikesRef.current = 0;
        }
      }
    };

    worker.postMessage({ type: "init", modelUrl: "/models/nsfw/model.json" });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !available) return;

    const id = setInterval(async () => {
      const video = videoRef.current;
      const worker = workerRef.current;
      if (!video || !worker || video.readyState < 2 || video.videoWidth === 0) {
        return;
      }
      try {
        const bitmap = await createImageBitmap(video, {
          resizeWidth: SAMPLE_SIZE,
          resizeHeight: SAMPLE_SIZE,
          resizeQuality: "low",
        });
        // Transferred, not copied: an ImageBitmap is backed by GPU memory and
        // structured-cloning one per sample would be pure waste.
        worker.postMessage(
          { type: "classify", bitmap, seq: ++seqRef.current },
          [bitmap],
        );
      } catch {
        /* video not ready this tick */
      }
    }, SAMPLE_INTERVAL_MS);

    return () => clearInterval(id);
  }, [enabled, available, videoRef]);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;

    const canvas = (canvasRef.current ??= document.createElement("canvas"));
    // Capped at 640px wide: enough for a moderator to make a judgement, small
    // enough that the upload stays well under the protocol's evidence limit.
    const scale = Math.min(1, 640 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  }, [videoRef]);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    setBlurred(false);
  }, []);

  const reset = useCallback(() => {
    dismissedRef.current = false;
    strikesRef.current = 0;
    setBlurred(false);
  }, []);

  return { blurred, available, dismiss, reset, captureFrame };
}
