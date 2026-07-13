import { useEffect } from "react";
import { useCira } from "@/lib/cira/provider";
import { onCiraInvite } from "@/lib/deep-link";
import { useView } from "@/lib/view";

// Relie le deep link vayra://cira/invite#t=<code> à l'UI : mémorise le code
// dans le provider CIRA puis ouvre Réglages -> CIRA où la décision se prend.
export function CiraInviteBridge() {
  const { presentInvite } = useCira();
  const { openSettings } = useView();
  useEffect(
    () =>
      onCiraInvite((code) => {
        presentInvite(code);
        openSettings("cira");
      }),
    [presentInvite, openSettings],
  );
  return null;
}
