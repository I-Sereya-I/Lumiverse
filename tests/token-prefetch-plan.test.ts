import { describe, expect, test } from 'bun:test'
import {
  planSelectionPrefetch,
  selectionPlanKey,
  shouldCountOpenEntryImmediately,
  type PrefetchEntryLike,
  type SelectionPrefetchDeps,
} from '../frontend/src/lib/tokenPrefetchPlan'
import {
  DEFAULT_ACTIVITY_PAUSE_MS,
  DEFAULT_MAX_CONCURRENT,
  TokenCountScheduler,
} from '../frontend/src/lib/tokenCountScheduler'
import { tokenCacheKey } from '../frontend/src/lib/tokenCountCache'
import { DEFAULT_LOREBOOK_EDITOR_SETTINGS } from '../frontend/src/lib/uiProductivityDefaults'

const hookSource = await Bun.file(
  new URL('../frontend/src/hooks/useTokenCounts.ts', import.meta.url),
).text()
const entryEditorSource = await Bun.file(
  new URL('../frontend/src/components/shared/WorldBookEntryEditor.tsx', import.meta.url),
).text()
const planSource = await Bun.file(
  new URL('../frontend/src/lib/tokenPrefetchPlan.ts', import.meta.url),
).text()

const MODEL = 'meta-llama/Llama-3.1-8B'

function entry(content: string, extensions: Record<string, unknown> | null = null): PrefetchEntryLike {
  return { content, extensions }
}

/**
 * A stored count that `lib/storedTokenCount` will certify: not approximate,
 * recorded for `model`, and recorded at this content's length.
 */
function validStored(content: string, count: number, model: string | null = MODEL) {
  return {
    _lumiverse_token_count: count,
    _lumiverse_token_count_approximate: false,
    _lumiverse_token_count_model: model,
    _lumiverse_token_count_len: content.length,
  }
}

interface Fakes extends SelectionPrefetchDeps {
  cached: Set<string>
  scheduled: Set<string>
  hashes: number
}

function makeDeps(overrides: { cached?: string[]; scheduled?: string[] } = {}): Fakes {
  const cached = new Set(overrides.cached ?? [])
  const scheduled = new Set(overrides.scheduled ?? [])
  const deps: Fakes = {
    cached,
    scheduled,
    hashes: 0,
    resolveKey: (_entry, model, content) => {
      deps.hashes += 1
      return tokenCacheKey(model, content)
    },
    hasCachedCount: (key) => cached.has(key),
    isScheduled: (key) => scheduled.has(key),
  }
  return deps
}

describe('planSelectionPrefetch', () => {
  test('the selected entry is requested in the interactive band, not the sweep band', () => {
    const target = entry('a dragon lives in the eastern range')
    const plan = planSelectionPrefetch(
      { entryId: 'e1', entry: target, model: MODEL, plannedFor: null },
      makeDeps(),
    )
    expect(plan.skip).toBeNull()
    expect(plan.request).toEqual({
      key: tokenCacheKey(MODEL, target.content),
      text: target.content,
      model: MODEL,
      priority: 'interactive',
    })
    // Never 'sweep': the sweep is paced one item per idle callback by design, and
    // the entry the user is looking at must not queue behind ~550 of them.
    expect(plan.request?.priority).not.toBe('sweep')
    expect(plan.dedupe).toBe('new')
    expect(plan.planKey).toBe(selectionPlanKey(MODEL, 'e1'))
  })

  test('nothing is planned before the entries fetch lands, and it re-arms when it does', () => {
    const deps = makeDeps()
    // The id is known (it was passed in as `initialEntryId`) but the list is not.
    const early = planSelectionPrefetch(
      { entryId: 'e1', entry: undefined, model: MODEL, plannedFor: null },
      deps,
    )
    expect(early.request).toBeNull()
    expect(early.skip).toBe('no-selection')
    // Crucially `null`, so the caller records nothing and the next run is not
    // suppressed as 'already-planned'.
    expect(early.planKey).toBeNull()
    expect(deps.hashes).toBe(0)

    const arrived = planSelectionPrefetch(
      { entryId: 'e1', entry: entry('now loaded'), model: MODEL, plannedFor: early.planKey },
      deps,
    )
    expect(arrived.request).not.toBeNull()
  })

  test('no selection at all is a skip, not a crash', () => {
    const plan = planSelectionPrefetch(
      { entryId: null, entry: null, model: MODEL, plannedFor: null },
      makeDeps(),
    )
    expect(plan.request).toBeNull()
    expect(plan.skip).toBe('no-selection')
  })

  test('typing in the open entry does not re-issue the prefetch', () => {
    const deps = makeDeps()
    const first = planSelectionPrefetch(
      { entryId: 'e1', entry: entry('draft'), model: MODEL, plannedFor: null },
      deps,
    )
    expect(first.request).not.toBeNull()

    // Same entry, different text — the caller re-ran because the entries array
    // was rebuilt by the edit. A request here would be `live` counting by
    // accident, once per keystroke.
    const second = planSelectionPrefetch(
      { entryId: 'e1', entry: entry('draft x'), model: MODEL, plannedFor: first.planKey },
      deps,
    )
    expect(second.request).toBeNull()
    expect(second.skip).toBe('already-planned')
    // And it cost no hash of the entry content.
    expect(deps.hashes).toBe(1)
  })

  test('a profile switch re-arms the prefetch, because the answer no longer applies', () => {
    const target = entry('same text, different tokenizer')
    const first = planSelectionPrefetch(
      { entryId: 'e1', entry: target, model: MODEL, plannedFor: null },
      makeDeps(),
    )
    const afterSwitch = planSelectionPrefetch(
      { entryId: 'e1', entry: target, model: 'gpt-4o', plannedFor: first.planKey },
      makeDeps(),
    )
    expect(afterSwitch.request?.model).toBe('gpt-4o')
    expect(afterSwitch.request?.key).toBe(tokenCacheKey('gpt-4o', target.content))
  })

  test('an empty entry is never sent to the tokenizer', () => {
    for (const content of ['', '   \n\t ']) {
      const plan = planSelectionPrefetch(
        { entryId: 'e1', entry: entry(content), model: MODEL, plannedFor: null },
        makeDeps(),
      )
      expect(plan.request).toBeNull()
      expect(plan.skip).toBe('empty-content')
    }
  })

  test('a stored count that storedTokenCount certifies suppresses the request', () => {
    const content = 'the count on this entry is already known'
    const deps = makeDeps()
    const plan = planSelectionPrefetch(
      { entryId: 'e1', entry: entry(content, validStored(content, 42)), model: MODEL, plannedFor: null },
      deps,
    )
    expect(plan.request).toBeNull()
    expect(plan.skip).toBe('stored-exact')
    // Suppressed before the O(content) key hash, not after.
    expect(deps.hashes).toBe(0)
  })

  test('a stored count the validator will not certify does NOT suppress the request', () => {
    const content = 'the stored number here cannot be trusted'
    // Three separate ways `readStoredTokenCount` demotes a stored count to `~`.
    // Every one of them must still produce a real request, otherwise the fast path
    // would pin a wrong-but-confident number for the entry the user has open.
    const untrustworthy: Record<string, unknown>[] = [
      // Counted for a different model (a profile switch since it was written).
      validStored(content, 42, 'gpt-4o'),
      // Counted for text of a different length (the entry has been edited).
      { ...validStored(content, 42), _lumiverse_token_count_len: content.length + 9 },
      // Written before `_len` existed: unverifiable.
      { _lumiverse_token_count: 42, _lumiverse_token_count_approximate: false, _lumiverse_token_count_model: MODEL },
      // It was only ever `length / 4`.
      { ...validStored(content, 42), _lumiverse_token_count_approximate: true },
    ]
    for (const extensions of untrustworthy) {
      const plan = planSelectionPrefetch(
        { entryId: 'e1', entry: entry(content, extensions), model: MODEL, plannedFor: null },
        makeDeps(),
      )
      expect(plan.skip).toBeNull()
      expect(plan.request?.text).toBe(content)
    }
  })

  test('an answer already in the session cache suppresses the request', () => {
    const content = 'counted earlier this session by the sweep'
    const plan = planSelectionPrefetch(
      { entryId: 'e1', entry: entry(content), model: MODEL, plannedFor: null },
      makeDeps({ cached: [tokenCacheKey(MODEL, content)] }),
    )
    expect(plan.request).toBeNull()
    expect(plan.skip).toBe('already-counted')
  })

  test('work the scheduler already holds is promoted, not skipped and not duplicated', () => {
    const content = 'this entry is sitting in the sweep queue'
    const plan = planSelectionPrefetch(
      { entryId: 'e1', entry: entry(content), model: MODEL, plannedFor: null },
      makeDeps({ scheduled: [tokenCacheKey(MODEL, content)] }),
    )
    // Still requested. Skipping would leave the open entry stuck behind the idle
    // sweep, which is the entire bug.
    expect(plan.request).not.toBeNull()
    expect(plan.dedupe).toBe('promote')
  })

  test('handing the plan to a real scheduler that holds it as sweep work dispatches once, immediately', () => {
    const calls: string[] = []
    const scheduler = new TokenCountScheduler({
      count: (text) => {
        calls.push(text)
        return new Promise(() => {})
      },
    })
    const content = 'the selected entry'
    const key = tokenCacheKey(MODEL, content)

    // The sweep got there first. Sweep items are never dispatched by `request`.
    void scheduler.request({ key, text: content, model: MODEL, priority: 'sweep' })
    expect(calls).toHaveLength(0)

    const plan = planSelectionPrefetch(
      { entryId: 'e1', entry: entry(content), model: MODEL, plannedFor: null },
      {
        resolveKey: (_entry, model, text) => tokenCacheKey(model, text),
        hasCachedCount: () => false,
        isScheduled: (candidate) => scheduler.has(candidate),
      },
    )
    expect(plan.dedupe).toBe('promote')
    void scheduler.request(plan.request!)

    // One HTTP request, dispatched now rather than on some future idle callback.
    expect(calls).toEqual([content])
    expect(scheduler.inFlightCount).toBe(1)
    expect(scheduler.queueLength).toBe(0)
  })
})

describe('shouldCountOpenEntryImmediately', () => {
  const base = {
    mode: 'delayed' as const,
    entryId: 'e1',
    content: 'the body of the entry',
    savedContent: 'the body of the entry',
    prefetchedEntryId: null,
  }

  test('a fresh open skips the debounce entirely', () => {
    expect(shouldCountOpenEntryImmediately(base)).toBe(true)
    expect(shouldCountOpenEntryImmediately({ ...base, mode: 'live' })).toBe(true)
  })

  test('an edited draft is left to the debounce', () => {
    // This is what `tokenCountDelayMs` is actually for: not delaying an open, but
    // not counting every intermediate state of an edit.
    expect(shouldCountOpenEntryImmediately({ ...base, content: 'the body of the entr' })).toBe(false)
  })

  test('it fires once per open, not once per render', () => {
    expect(shouldCountOpenEntryImmediately({ ...base, prefetchedEntryId: 'e1' })).toBe(false)
    // A different entry is a different open.
    expect(shouldCountOpenEntryImmediately({ ...base, prefetchedEntryId: 'e0' })).toBe(true)
  })

  test('manual means manual', () => {
    expect(shouldCountOpenEntryImmediately({ ...base, mode: 'manual' })).toBe(false)
  })

  test('an empty entry is not counted', () => {
    expect(shouldCountOpenEntryImmediately({ ...base, content: '  ', savedContent: '  ' })).toBe(false)
  })
})

describe('the selected entry is not paced by the background sweep', () => {
  test('the workspace issues the selection count alongside the entries it just loaded', () => {
    // `entries` in the dep list is the "rides the same round trip" property: the
    // effect re-runs in the commit the fetch resolves into, so the count request
    // goes out as the first row paints rather than a debounce later.
    expect(hookSource).toContain('planSelectionPrefetch({')
    expect(hookSource).toContain('}, [bookId, entries, model, prefetchDeps, selectedEntryId])')
    expect(hookSource).toContain('plannedSelectionRef.current = plan.planKey')
    expect(hookSource).toContain('void getTokenCountScheduler().request(plan.request)')
  })

  test('the sweep keeps its pacing — exactly one entry took the fast path', () => {
    // The properties the prior investigation called deliberate: a hard ceiling of
    // two in flight, a 500ms park after every keystroke, one dispatch per idle
    // callback. None of them moved; the fast path is scoped to the selection.
    expect(DEFAULT_MAX_CONCURRENT).toBe(2)
    expect(DEFAULT_ACTIVITY_PAUSE_MS).toBe(500)
    expect(hookSource).toContain("priority: 'sweep'")
    expect(hookSource).toContain('scheduler.pumpSweep()')
    // The fast path asks for one key, from one entry — never a list.
    expect(planSource).not.toContain('for (')
    expect(planSource).not.toContain('.map(')
  })

  test('the open entry displays immediately but still saves on the timer', () => {
    expect(entryEditorSource).toContain('shouldCountOpenEntryImmediately({')
    expect(entryEditorSource).toContain("void resolveTokenCount(content, 'auto', { persist: false })")
    // The delayed pass is the only writer, exactly as before.
    expect(entryEditorSource).toContain("tokenCountMode === 'delayed' ? Math.max(0, tokenCountDelayMs) : 300")
    expect(entryEditorSource).toContain('if (persist) persistTokenCount(')
  })

  test('no batch endpoint and no background write crept in with it', () => {
    for (const source of [hookSource, planSource]) {
      expect(source).not.toContain('count-batch')
      expect(source).not.toContain('onImmediateUpdate')
      expect(source).not.toContain('saveEntry')
    }
    expect(planSource).not.toContain('worldBooksApi')
  })

  test('the delay that remains is the scheduler window, and is only a default', () => {
    expect(DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountDelayMs).toBe(500)
    // `mergeStoredSetting` backfills missing keys from the defaults, so this reaches
    // users who never set it and leaves a stored 1000 alone. No migration.
    expect(DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountMode).toBe('delayed')
  })
})
