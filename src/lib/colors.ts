// Stable per-app colours that read on both themes.
const PALETTE = [
  "#7c8cff", "#4fc3a1", "#f4a35f", "#e86f8f", "#5fb3f4",
  "#b98cf5", "#d6c35a", "#6fd0d6", "#f08a5d", "#8fc66b",
];

export function appColor(appId: number): string {
  return PALETTE[Math.abs(appId) % PALETTE.length];
}
