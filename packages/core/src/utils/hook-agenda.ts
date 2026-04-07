import type { HookAgenda } from "../models/input-governance.js";
import type { HookRecord, HookStatus } from "../models/runtime-state.js";
import type { StoredHook } from "../state/memory-db.js";
import { describeHookLifecycle, resolveHookPayoffTiming } from "./hook-lifecycle.js";
import { HOOK_AGENDA_LIMITS, HOOK_AGENDA_LOAD_THRESHOLDS, type HookAgendaLoad } from "./hook-policy.js";

export const DEFAULT_HOOK_LOOKAHEAD_CHAPTERS = 3;

/**
 * Build the hook agenda using lifecycle-aware scheduling.
 * Uses payoffTiming profiles to differentiate short/long hooks:
 * - immediate hooks trigger resolve pressure after 1-3 chapters
 * - slow-burn hooks stay dormant until middle phase
 * - endgame hooks only resolve in late phase
 */
export function buildPlannerHookAgenda(params: {
  readonly hooks: ReadonlyArray<StoredHook>;
  readonly chapterNumber: number;
  readonly targetChapters?: number;
  readonly language?: "zh" | "en";
  readonly maxMustAdvance?: number;
  readonly maxEligibleResolve?: number;
  readonly maxStaleDebt?: number;
}): HookAgenda {
  const agendaHooks = params.hooks
    .map(normalizeStoredHook)
    .filter((hook) => !isFuturePlannedHook(hook, params.chapterNumber, 0))
    .filter((hook) => hook.status !== "resolved" && hook.status !== "deferred");

  // Compute lifecycle for each hook
  const withLifecycle = agendaHooks.map((hook) => ({
    hook,
    lifecycle: describeHookLifecycle({
      payoffTiming: hook.payoffTiming,
      expectedPayoff: hook.expectedPayoff,
      notes: hook.notes,
      startChapter: hook.startChapter,
      lastAdvancedChapter: hook.lastAdvancedChapter,
      status: hook.status,
      chapterNumber: params.chapterNumber,
      targetChapters: params.targetChapters,
    }),
  }));

  // Determine agenda load
  const load = resolveAgendaLoad(withLifecycle);
  const limits = HOOK_AGENDA_LIMITS[load];

  // eligibleResolve: lifecycle says readyToResolve, sorted by resolvePressure desc
  const eligibleResolveHooks = withLifecycle
    .filter((entry) => entry.lifecycle.readyToResolve)
    .sort((left, right) => right.lifecycle.resolvePressure - left.lifecycle.resolvePressure)
    .slice(0, params.maxEligibleResolve ?? limits.eligibleResolve);

  // staleDebt: lifecycle says stale or overdue, sorted by advancePressure desc
  const resolveIds = new Set(eligibleResolveHooks.map((entry) => entry.hook.hookId));
  const staleDebtHooks = withLifecycle
    .filter((entry) => (entry.lifecycle.stale || entry.lifecycle.overdue) && !resolveIds.has(entry.hook.hookId))
    .sort((left, right) => right.lifecycle.advancePressure - left.lifecycle.advancePressure)
    .slice(0, params.maxStaleDebt ?? limits.staleDebt);

  // mustAdvance: highest advancePressure, excluding those already in resolve/stale
  const usedIds = new Set([
    ...resolveIds,
    ...staleDebtHooks.map((entry) => entry.hook.hookId),
  ]);
  const mustAdvanceHooks = withLifecycle
    .filter((entry) => !usedIds.has(entry.hook.hookId))
    .sort((left, right) => right.lifecycle.advancePressure - left.lifecycle.advancePressure)
    .slice(0, params.maxMustAdvance ?? limits.mustAdvance);

  // avoidNewHookFamilies: families with stale/overdue/pressured hooks
  const pressuredFamilies = withLifecycle
    .filter((entry) => entry.lifecycle.stale || entry.lifecycle.overdue)
    .map((entry) => entry.hook.type.trim())
    .filter(Boolean);
  const avoidNewHookFamilies = [...new Set(pressuredFamilies)].slice(0, limits.avoidFamilies);

  return {
    pressureMap: [],
    mustAdvance: mustAdvanceHooks.map((entry) => entry.hook.hookId),
    eligibleResolve: eligibleResolveHooks.map((entry) => entry.hook.hookId),
    staleDebt: staleDebtHooks.map((entry) => entry.hook.hookId),
    avoidNewHookFamilies,
  };
}

function resolveAgendaLoad(
  entries: ReadonlyArray<{ lifecycle: ReturnType<typeof describeHookLifecycle> }>,
): HookAgendaLoad {
  const readyCount = entries.filter((e) => e.lifecycle.readyToResolve).length;
  const staleCount = entries.filter((e) => e.lifecycle.stale).length;
  const overdueCount = entries.filter((e) => e.lifecycle.overdue).length;
  const pressuredCount = entries.filter((e) => e.lifecycle.stale || e.lifecycle.overdue).length;

  if (
    readyCount >= HOOK_AGENDA_LOAD_THRESHOLDS.heavyReadyCount
    || staleCount >= HOOK_AGENDA_LOAD_THRESHOLDS.heavyStaleCount
    || overdueCount >= HOOK_AGENDA_LOAD_THRESHOLDS.heavyCriticalCount
    || pressuredCount >= HOOK_AGENDA_LOAD_THRESHOLDS.heavyPressuredCount
  ) {
    return "heavy";
  }

  if (
    readyCount >= HOOK_AGENDA_LOAD_THRESHOLDS.mediumReadyCount
    || staleCount >= HOOK_AGENDA_LOAD_THRESHOLDS.mediumStaleCount
    || overdueCount >= HOOK_AGENDA_LOAD_THRESHOLDS.mediumCriticalCount
  ) {
    return "medium";
  }

  return "light";
}

function normalizeStoredHook(hook: StoredHook): HookRecord {
  return {
    hookId: hook.hookId,
    startChapter: Math.max(0, hook.startChapter),
    type: hook.type,
    status: normalizeStoredHookStatus(hook.status),
    lastAdvancedChapter: Math.max(0, hook.lastAdvancedChapter),
    expectedPayoff: hook.expectedPayoff,
    payoffTiming: resolveHookPayoffTiming(hook),
    notes: hook.notes,
  };
}

function normalizeStoredHookStatus(status: string): HookStatus {
  if (/^(resolved|closed|done|已回收|已解决)$/i.test(status.trim())) return "resolved";
  if (/^(deferred|paused|hold|延后|延期|搁置|暂缓)$/i.test(status.trim())) return "deferred";
  if (/^(progressing|advanced|重大推进|持续推进)$/i.test(status.trim())) return "progressing";
  return "open";
}

export function filterActiveHooks(hooks: ReadonlyArray<StoredHook>): StoredHook[] {
  return hooks.filter((hook) => normalizeStoredHookStatus(hook.status) !== "resolved");
}

export function isFuturePlannedHook(
  hook: StoredHook,
  chapterNumber: number,
  lookahead: number = DEFAULT_HOOK_LOOKAHEAD_CHAPTERS,
): boolean {
  return hook.lastAdvancedChapter <= 0 && hook.startChapter > chapterNumber + lookahead;
}

export function isHookWithinChapterWindow(
  hook: StoredHook,
  chapterNumber: number,
  recentWindow: number = 5,
  lookahead: number = DEFAULT_HOOK_LOOKAHEAD_CHAPTERS,
): boolean {
  const recentCutoff = Math.max(0, chapterNumber - recentWindow);

  if (hook.lastAdvancedChapter > 0 && hook.lastAdvancedChapter >= recentCutoff) {
    return true;
  }

  if (hook.lastAdvancedChapter > 0) {
    return false;
  }

  if (hook.startChapter <= 0) {
    return true;
  }

  if (hook.startChapter >= recentCutoff && hook.startChapter <= chapterNumber) {
    return true;
  }

  return hook.startChapter > chapterNumber && hook.startChapter <= chapterNumber + lookahead;
}
