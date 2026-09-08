/// <reference lib="webworker" />

/**
 * Runs the NSFW classifier off the main thread.
 *
 * Two reasons this is a worker rather than an inline call. First, TensorFlow's
 * WebGL backend blocks while it uploads and runs, and a 15-30ms stall on the
 * main thread during a live video call shows up as dropped frames. Second, the
 * model is several megabytes: keeping it here means it is fetched and compiled
 * off the critical path and can never leak into the page bundle.
 *
 * All of this runs on the viewer's device. Frames are never uploaded, so it
 * costs the server nothing — the only image that ever reaches us is one a user
 * deliberately attaches to a report.
 *
 * We drive the model with tfjs-converter directly rather than using the nsfwjs
 * wrapper. nsfwjs v4 embeds its weights as bundled modules behind dynamic
 * requires that webpack cannot statically analyse, and bundling several
 * megabytes of weights into JavaScript is the opposite of what we want: the
 * weights are vendored as plain files by scripts/fetch-nsfw-model.mjs and
 * fetched once, cached forever. Inference itself is about fifteen lines.
 */

import * as tf from "@tensorflow/tfjs-core";
import { loadGraphModel, type GraphModel } from "@tensorflow/tfjs-converter";
import "@tensorflow/tfjs-backend-webgl";

export type NsfwRequest =
  | { type: "init"; modelUrl: string }
  | { type: "classify"; bitmap: ImageBitmap; seq: number };

export type NsfwResponse =
  | { type: "ready" }
  | { type: "unavailable"; reason: string }
  | { type: "result"; seq: number; explicitScore: number };

/** Output order of the nsfwjs MobileNetV2 graph — alphabetical by class name. */
const CLASSES = ["Drawing", "Hentai", "Neutral", "Porn", "Sexy"] as const;

let model: GraphModel | null = null;

self.onmessage = async (event: MessageEvent<NsfwRequest>) => {
  const msg = event.data;

  if (msg.type === "init") {
    try {
      await tf.setBackend("webgl");
      await tf.ready();
      model = await loadGraphModel(msg.modelUrl);

      // One warm-up pass. The first inference compiles WebGL shaders and takes
      // an order of magnitude longer than steady state; doing it now means the
      // first real frame isn't the slow one.
      tf.tidy(() => {
        const warm = tf.zeros([1, 224, 224, 3]);
        (model!.predict(warm) as tf.Tensor).dispose();
      });

      post({ type: "ready" });
    } catch (err) {
      // Almost always means the weights haven't been vendored yet. The call
      // must keep working regardless — this is a safety net, not a gate.
      post({
        type: "unavailable",
        reason: err instanceof Error ? err.message : "model failed to load",
      });
    }
    return;
  }

  if (msg.type === "classify") {
    if (!model) {
      msg.bitmap.close();
      return;
    }

    let output: tf.Tensor | null = null;
    try {
      output = tf.tidy(() => {
        // The bitmap arrives pre-resized to 224x224 from the caller, so there
        // is no resize step here. Normalised to [0,1], which is what this graph
        // was trained against.
        //
        // Functional API rather than chained (`.toFloat().div(255)`): the
        // chained methods are registered by the full `@tensorflow/tfjs` bundle,
        // and we deliberately depend only on core + converter + webgl to keep
        // this worker as small as possible.
        const pixels = tf.browser.fromPixels(msg.bitmap);
        const normalized = tf.div(tf.cast(pixels, "float32"), 255);
        const batched = tf.expandDims(normalized, 0);
        return model!.predict(batched) as tf.Tensor;
      });

      const probs = await output.data();

      // Summed rather than max: "Porn" and "Hentai" are separate classes and a
      // frame can split confidence between them while still plainly being one
      // or the other. "Sexy" counts at a discount because on its own it flags
      // swimwear and gym clothes, which are not violations.
      const score =
        (probs[CLASSES.indexOf("Porn")] ?? 0) +
        (probs[CLASSES.indexOf("Hentai")] ?? 0) +
        (probs[CLASSES.indexOf("Sexy")] ?? 0) * 0.35;

      post({ type: "result", seq: msg.seq, explicitScore: Math.min(score, 1) });
    } catch {
      /* a single dropped frame is not worth reporting */
    } finally {
      output?.dispose();
      msg.bitmap.close();
    }
  }
};

function post(msg: NsfwResponse): void {
  (self as unknown as Worker).postMessage(msg);
}
