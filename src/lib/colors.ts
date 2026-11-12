// Stable per-app colours that read on both themes.
const PALETTE = [
  "#7c8cff", "#4fc3a1", "#f4a35f", "#e86f8f", "#5fb3f4",
  "#b98cf5", "#d6c35a", "#6fd0d6", "#f08a5d", "#8fc66b",
];

export function appColor(appId: number): string {
  return PALETTE[Math.abs(appId) % PALETTE.length];
}

const CATEGORY: Record<string, string> = {
  Development: "#7c8cff",
  Browsing: "#5fb3f4",
  Communication: "#4fc3a1",
  Design: "#e86f8f",
  Productivity: "#d6c35a",
  Entertainment: "#f4a35f",
  System: "#8b8d9c",
  Other: "#b98cf5",
};

export function categoryColor(name: string): string {
  return CATEGORY[name] ?? CATEGORY.Other;
}
