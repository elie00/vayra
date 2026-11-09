// Android's Back inside the phone settings: from a section it returns to the
// list of sections rather than leaving the settings. The settings page
// registers how to go back while a section is open.

let back: (() => void) | null = null;

export function setSettingsBack(fn: (() => void) | null): void {
  back = fn;
}

/** Goes back within the settings, if a section is open; true when it did. */
export function consumeSettingsBack(): boolean {
  if (!back) return false;
  const fn = back;
  back = null;
  fn();
  return true;
}
