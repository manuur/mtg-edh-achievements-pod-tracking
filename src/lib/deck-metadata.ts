export const MTG_COLORS = ["W", "U", "B", "R", "G"] as const;
export type MtgColor = typeof MTG_COLORS[number];

export const MTG_COLOR_NAMES: Record<MtgColor, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

export function canonicalColorIdentity(colors: readonly MtgColor[]) {
  const selected = new Set(colors);
  return MTG_COLORS.filter((color) => selected.has(color));
}

export function formatColorIdentity(colors: readonly MtgColor[] | null) {
  if (colors === null) return "Color identity not set";
  if (colors.length === 0) return "Colorless";
  return colors.join("");
}
