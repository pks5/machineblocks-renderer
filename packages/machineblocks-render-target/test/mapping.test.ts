import { describe, expect, it } from "vitest";
import { mapManifestation } from "@machineblocks/render-target";

const modelsToScad = {
  kind: "explicit" as const,
  sourcePackage: "com.example.models",
  targetPackage: "com.example.scad",
};

describe("manifestation mapping", () => {
  it("replaces one bml segment", () => {
    expect(mapManifestation("com.example.bml.Brick")).toEqual({
      ok: true,
      fqn: "com.example.scad.Brick",
    });
  });

  it("maps an explicit source root and keeps the remainder", () => {
    expect(mapManifestation("com.example.models.bricks.Brick", modelsToScad)).toEqual({
      ok: true,
      fqn: "com.example.scad.bricks.Brick",
    });
  });

  it("fails when no bml segment exists", () => {
    const result = mapManifestation("com.example.models.Brick");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("MB_TARGET_PACKAGE_UNDETERMINED");
      expect(result.message).toContain("com.example.models.Brick");
      expect(result.message).toContain("--source-package");
    }
  });

  it("lets an explicit target replace the bml convention", () => {
    expect(
      mapManifestation("com.example.bml.Brick", {
        kind: "explicit",
        sourcePackage: "com.example.bml",
        targetPackage: "com.example.generated",
      }),
    ).toEqual({ ok: true, fqn: "com.example.generated.Brick" });
  });

  it("fails when several bml segments exist", () => {
    const result = mapManifestation("com.bml.example.bml.MyBrick");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("MB_TARGET_PACKAGE_AMBIGUOUS");
      expect(result.message).toContain("com.bml.example.bml.MyBrick");
    }
  });

  it("does not replace a bml substring", () => {
    for (const fqn of ["com.example.mybml.MyBrick", "com.example.bmlmodels.MyBrick", "com.example.Bml.MyBrick"]) {
      const result = mapManifestation(fqn);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("MB_TARGET_PACKAGE_UNDETERMINED");
      }
    }
  });

  it("maps a reference outside the source root with the bml rule", () => {
    expect(mapManifestation("com.machineblocks.bml.bricks.Standard", modelsToScad, "reference")).toEqual({
      ok: true,
      fqn: "com.machineblocks.scad.bricks.Standard",
    });
  });

  it("rejects a selected block outside the source root", () => {
    const result = mapManifestation("com.example.other.Brick", modelsToScad, "selected");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("MB_SOURCE_OUTSIDE_ROOT");
    }
  });
});
