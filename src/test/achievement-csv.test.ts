import { describe, expect, it } from "vitest";
import { parseAchievementCsv } from "@/server/achievements";

describe("achievement CSV", () => {
  it("generates a stable slug when code is omitted", () => {
    const [row] = parseAchievementCsv("name,description,category,display_order\nTable Savior,Save everyone,Politics,20");
    expect(row).toMatchObject({ code: "table-savior", name: "Table Savior", category: "Politics", displayOrder: 20 });
  });

  it("supports quoted commas", () => {
    const [row] = parseAchievementCsv('code,name,description,category,display_order\nbig-save,"Big, Big Save","Resolve, then win",Politics,10');
    expect(row.name).toBe("Big, Big Save");
    expect(row.description).toBe("Resolve, then win");
  });

  it("rejects duplicate codes before any import runs", () => {
    expect(() => parseAchievementCsv("code,name\nsame,One\nsame,Two")).toThrow(/Duplicate achievement code/);
  });

  it("requires a name column", () => expect(() => parseAchievementCsv("code,category\ntest,General")).toThrow(/name column/));
  it("rejects empty and malformed quoted data", () => {
    expect(() => parseAchievementCsv("code,name\n,")).toThrow(/does not contain/);
    expect(() => parseAchievementCsv('code,name\ntest,"Never closes')).toThrow(/unclosed quoted field/);
  });
});
