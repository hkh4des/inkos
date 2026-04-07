import { describe, expect, it } from "vitest";
import {
  buildPlannerHookAgenda,
  isHookWithinChapterWindow,
} from "../utils/hook-agenda.js";
import type { StoredHook } from "../state/memory-db.js";

function createHook(overrides: Partial<StoredHook> = {}): StoredHook {
  return {
    hookId: overrides.hookId ?? "mentor-oath",
    startChapter: overrides.startChapter ?? 8,
    type: overrides.type ?? "relationship",
    status: overrides.status ?? "open",
    lastAdvancedChapter: overrides.lastAdvancedChapter ?? 9,
    expectedPayoff: overrides.expectedPayoff ?? "Reveal why the mentor broke the oath",
    payoffTiming: overrides.payoffTiming ?? "slow-burn",
    notes: overrides.notes ?? "Long debt should stay visible",
  };
}

describe("hook-agenda", () => {
  it("builds agenda with lifecycle-aware scheduling and chapter-window filtering", () => {
    const staleSlowBurn = createHook({
      hookId: "mentor-oath",
      startChapter: 4,
      lastAdvancedChapter: 7,
      notes: "Long debt is stalling",
    });
    const readyMystery = createHook({
      hookId: "ledger-fragment",
      type: "mystery",
      startChapter: 2,
      lastAdvancedChapter: 10,
      payoffTiming: "near-term",
      expectedPayoff: "Reveal the ledger fragment's origin",
      notes: "Ready to cash out",
    });

    const agenda = buildPlannerHookAgenda({
      hooks: [staleSlowBurn, readyMystery],
      chapterNumber: 12,
      targetChapters: 24,
      language: "en",
    });

    // Both hooks are stale at chapter 12: slow-burn dormancy=5 meets threshold,
    // near-term dormancy=2 meets threshold and is overdue (age 10 >= 5).
    // Neither is readyToResolve (slow-burn needs late phase or overdue; near-term
    // lacks momentum). Both land in staleDebt sorted by advancePressure.
    expect(agenda.staleDebt).toContain("ledger-fragment");
    expect(agenda.staleDebt).toContain("mentor-oath");
    expect(agenda.eligibleResolve).toEqual([]);

    expect(isHookWithinChapterWindow(staleSlowBurn, 12, 5)).toBe(true);
    expect(isHookWithinChapterWindow(readyMystery, 12, 5)).toBe(true);
  });
});
