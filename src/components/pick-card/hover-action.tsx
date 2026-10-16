import type { ReactNode } from "react";

/** An action over a card's poster. On a card it is a real button, outside the
 *  card's own button so it can take focus, and skipped by arrow navigation so
 *  arrows still move from card to card. A settings preview is itself a control,
 *  so there it is only drawn. */
export function HoverAction({
  label,
  onActivate,
  preview,
  className,
  children,
}: {
  label: string;
  onActivate: () => void;
  preview?: boolean;
  className: string;
  children: ReactNode;
}) {
  if (preview) {
    return (
      <span aria-hidden="true" className={`pointer-events-none ${className}`}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-spatial-skip
      onClick={onActivate}
      className={`pointer-events-auto ${className}`}
    >
      {children}
    </button>
  );
}
