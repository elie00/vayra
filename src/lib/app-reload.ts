// Kept behind a module so tests can observe reloads, which jsdom cannot stub.
export function reloadApp(): void {
  window.location.reload();
}
