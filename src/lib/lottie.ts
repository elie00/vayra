type LottieModule = typeof import("lottie-web");

let lottiePromise: Promise<LottieModule["default"]> | null = null;

export function loadLottie(): Promise<LottieModule["default"]> {
  lottiePromise ??= import("lottie-web").then((module) => module.default);
  return lottiePromise;
}
