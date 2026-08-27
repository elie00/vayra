import type { AnimationItem } from "lottie-web";
import { useEffect, useRef } from "react";
import { loadLottie } from "@/lib/lottie";

type Props = {
  data: object;
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
  speed?: number;
};

export function LottiePlayer({ data, className, loop = true, autoplay = true, speed = 1 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let cancelled = false;
    void loadLottie().then((lottie) => {
      if (cancelled) return;
      const anim = lottie.loadAnimation({
        container: host,
        renderer: "svg",
        loop,
        autoplay,
        animationData: data,
      });
      anim.setSpeed(speed);
      animRef.current = anim;
    });
    return () => {
      cancelled = true;
      animRef.current?.destroy();
      animRef.current = null;
    };
  }, [data, loop, autoplay, speed]);

  return <div ref={ref} className={className} aria-hidden />;
}
