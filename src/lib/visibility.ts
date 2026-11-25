import { useEffect, useState, type RefObject } from "react";

type Callback = (visible: boolean) => void;

const subs = new WeakMap<Element, Set<Callback>>();
let observer: IntersectionObserver | null = null;
let observerCtor: typeof IntersectionObserver | undefined;

function ensureObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  if (observer && observerCtor === IntersectionObserver) return observer;
  observerCtor = IntersectionObserver;
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const set = subs.get(e.target);
        if (!set) continue;
        for (const cb of [...set]) {
          cb(e.isIntersecting);
        }
      }
    },
    { rootMargin: "100px" },
  );
  return observer;
}

export function observe(el: Element, cb: Callback): () => void {
  const o = ensureObserver();
  if (!o) {
    cb(true);
    return () => {};
  }
  let set = subs.get(el);
  const first = !set;
  if (!set) {
    set = new Set();
    subs.set(el, set);
  }
  set.add(cb);
  if (first) o.observe(el);
  return () => {
    const cur = subs.get(el);
    if (!cur) return;
    cur.delete(cb);
    if (cur.size === 0) {
      subs.delete(el);
      o.unobserve(el);
    }
  };
}

export function useInViewport(
  ref: RefObject<Element | null>,
  initial = false,
): boolean {
  const [inView, setInView] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observe(el, setInView);
  }, [ref]);
  return inView;
}

export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden,
  );
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}
