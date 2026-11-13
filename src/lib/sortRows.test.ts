import { describe, expect, it } from "vitest";
import { nextSort, sortRows } from "./sortRows";

type Row = { id: string; v: string | number | null };
const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("sortRows", () => {
  it("sorts text A to Z, ignoring case", () => {
    const rows: Row[] = [{ id: "a", v: "tone" }, { id: "b", v: "Action" }, { id: "c", v: "refund" }];
    expect(ids(sortRows(rows, (r) => r.v, "asc"))).toEqual(["b", "c", "a"]);
  });

  it("sorts numbers in text in number order", () => {
    const rows: Row[] = [{ id: "a", v: "worker-10" }, { id: "b", v: "worker-2" }];
    expect(ids(sortRows(rows, (r) => r.v, "asc"))).toEqual(["b", "a"]);
  });

  it("sorts numbers high to low when descending", () => {
    const rows: Row[] = [{ id: "a", v: 1 }, { id: "b", v: 3 }, { id: "c", v: 2 }];
    expect(ids(sortRows(rows, (r) => r.v, "desc"))).toEqual(["b", "c", "a"]);
  });

  it("puts rows with no value last in both directions", () => {
    const rows: Row[] = [{ id: "a", v: null }, { id: "b", v: 2 }, { id: "c", v: 1 }];
    expect(ids(sortRows(rows, (r) => r.v, "asc"))).toEqual(["c", "b", "a"]);
    expect(ids(sortRows(rows, (r) => r.v, "desc"))).toEqual(["b", "c", "a"]);
  });

  it("keeps the order of equal rows", () => {
    const rows: Row[] = [{ id: "a", v: 1 }, { id: "b", v: 1 }];
    expect(ids(sortRows(rows, (r) => r.v, "desc"))).toEqual(["a", "b"]);
  });

  it("does not change the list it was given", () => {
    const rows: Row[] = [{ id: "a", v: 2 }, { id: "b", v: 1 }];
    sortRows(rows, (r) => r.v, "asc");
    expect(ids(rows)).toEqual(["a", "b"]);
  });
});

describe("nextSort", () => {
  it("flips the direction when the same column is clicked", () => {
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSort({ key: "name", dir: "desc" }, "name")).toEqual({ key: "name", dir: "asc" });
  });

  it("starts a new column in its first direction", () => {
    expect(nextSort({ key: "name", dir: "desc" }, "status")).toEqual({ key: "status", dir: "asc" });
    expect(nextSort<"name" | "seen">({ key: "name", dir: "asc" }, "seen", "desc")).toEqual({ key: "seen", dir: "desc" });
  });
});
