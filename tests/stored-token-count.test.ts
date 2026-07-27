import { describe, expect, test } from 'bun:test'
import {
  readStoredTokenCount,
  STORED_TOKEN_COUNT_APPROXIMATE_KEY,
  STORED_TOKEN_COUNT_KEY,
  STORED_TOKEN_COUNT_LENGTH_KEY,
  STORED_TOKEN_COUNT_MODEL_KEY,
} from '../frontend/src/lib/storedTokenCount'

/**
 * Behavioural coverage for the stored-count gate.
 *
 * Two bugs motivated it, and both produced a *wrong number rendered without the
 * `~` marker*, i.e. presented as exact:
 *
 * 1. nothing invalidated `_lumiverse_token_count` when the entry's content
 *    changed — the save path writes `content` and never touches `extensions`;
 * 2. `_lumiverse_token_count_model` was written and never compared, while the
 *    in-memory cache keys on the model, so switching profiles kept the previous
 *    model's number on screen as exact.
 *
 * The last block pins the honest limit of the fix: a same-length edit still slips
 * through. That is a deliberate, documented narrowing, not an oversight, and the
 * test exists so nobody later mistakes the gate for a proof.
 */

const CONTENT = 'The Lion Sin of Pride'

function stored(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [STORED_TOKEN_COUNT_KEY]: 7,
    [STORED_TOKEN_COUNT_APPROXIMATE_KEY]: false,
    [STORED_TOKEN_COUNT_MODEL_KEY]: 'gpt-4o',
    [STORED_TOKEN_COUNT_LENGTH_KEY]: CONTENT.length,
    ...over,
  }
}

describe('absence', () => {
  test('no extensions at all is no opinion', () => {
    expect(readStoredTokenCount(null, CONTENT, 'gpt-4o')).toBeNull()
    expect(readStoredTokenCount(undefined, CONTENT, 'gpt-4o')).toBeNull()
    expect(readStoredTokenCount({}, CONTENT, 'gpt-4o')).toBeNull()
  })

  test('an unrelated extensions bag is no opinion', () => {
    expect(readStoredTokenCount({ someOtherThing: 12 }, CONTENT, 'gpt-4o')).toBeNull()
  })
})

describe('a fully validated record is the only thing reported as exact', () => {
  test('value, marker, model and length all agree', () => {
    expect(readStoredTokenCount(stored(), CONTENT, 'gpt-4o')).toEqual({ value: 7, exact: true })
  })

  test('a numeric string survives a JSON round trip', () => {
    expect(readStoredTokenCount(
      stored({ [STORED_TOKEN_COUNT_KEY]: '7', [STORED_TOKEN_COUNT_LENGTH_KEY]: String(CONTENT.length) }),
      CONTENT,
      'gpt-4o',
    )).toEqual({ value: 7, exact: true })
  })

  test('a modelless count matches a modelless reader, and only that', () => {
    const record = stored({ [STORED_TOKEN_COUNT_MODEL_KEY]: null })
    expect(readStoredTokenCount(record, CONTENT, null)).toEqual({ value: 7, exact: true })
    expect(readStoredTokenCount(record, CONTENT, 'gpt-4o')).toEqual({ value: 7, exact: false })
    // Absent and `null` are the same claim: "no model was recorded".
    const missing = stored()
    delete missing[STORED_TOKEN_COUNT_MODEL_KEY]
    expect(readStoredTokenCount(missing, CONTENT, null)).toEqual({ value: 7, exact: true })
  })

  test('zero is a real count, not a missing one', () => {
    expect(readStoredTokenCount(
      stored({ [STORED_TOKEN_COUNT_KEY]: 0, [STORED_TOKEN_COUNT_LENGTH_KEY]: 0 }),
      '',
      'gpt-4o',
    )).toEqual({ value: 0, exact: true })
  })
})

describe('bug 2 — the recorded model is compared, not merely written', () => {
  test('a different model demotes to an estimate', () => {
    expect(readStoredTokenCount(stored(), CONTENT, 'claude-sonnet-4'))
      .toEqual({ value: 7, exact: false })
  })

  test('switching to no model at all demotes too', () => {
    expect(readStoredTokenCount(stored(), CONTENT, null)).toEqual({ value: 7, exact: false })
  })

  test('a non-string stored model is not a model', () => {
    expect(readStoredTokenCount(stored({ [STORED_TOKEN_COUNT_MODEL_KEY]: 42 }), CONTENT, 'gpt-4o'))
      .toEqual({ value: 7, exact: false })
  })
})

describe('bug 1 — a count is only exact for the text it was taken from', () => {
  test('an edit that changes the length demotes to an estimate', () => {
    expect(readStoredTokenCount(stored(), `${CONTENT} and Wrath`, 'gpt-4o'))
      .toEqual({ value: 7, exact: false })
    expect(readStoredTokenCount(stored(), CONTENT.slice(0, -1), 'gpt-4o'))
      .toEqual({ value: 7, exact: false })
  })

  test('a legacy record written before the length key existed is unverifiable', () => {
    // The ~100 counts already in the database have no `_len`. Demoting them is
    // the honest outcome — nothing on the record proves which text they describe
    // — and the next count of that entry re-earns exactness.
    const legacy = stored()
    delete legacy[STORED_TOKEN_COUNT_LENGTH_KEY]
    expect(readStoredTokenCount(legacy, CONTENT, 'gpt-4o')).toEqual({ value: 7, exact: false })
  })

  test('a non-finite or unparseable length is treated as absent', () => {
    for (const bad of [Number.NaN, Infinity, 'not a number', '', null, true, {}]) {
      expect(readStoredTokenCount(stored({ [STORED_TOKEN_COUNT_LENGTH_KEY]: bad }), CONTENT, 'gpt-4o'))
        .toEqual({ value: 7, exact: false })
    }
  })
})

describe('an approximate record can never be promoted', () => {
  test('the marker wins even when model and length agree', () => {
    expect(readStoredTokenCount(stored({ [STORED_TOKEN_COUNT_APPROXIMATE_KEY]: true }), CONTENT, 'gpt-4o'))
      .toEqual({ value: 7, exact: false })
  })

  test('any truthy marker counts, not just the boolean', () => {
    expect(readStoredTokenCount(stored({ [STORED_TOKEN_COUNT_APPROXIMATE_KEY]: 'yes' }), CONTENT, 'gpt-4o'))
      .toEqual({ value: 7, exact: false })
  })
})

describe('a value that is not a number is not a count', () => {
  test('non-finite numbers are no opinion, not a zero', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(readStoredTokenCount(stored({ [STORED_TOKEN_COUNT_KEY]: bad }), CONTENT, 'gpt-4o')).toBeNull()
    }
  })

  test('`Number()` coercions that used to become 0 or 1 are rejected', () => {
    // The previous read was `Number(extensions?._lumiverse_token_count)`, which
    // turned `null`, `''`, `[]` and `false` into a confident `0` and `true` into
    // a confident `1`.
    for (const bad of [null, undefined, '', '   ', [], {}, false, true]) {
      expect(readStoredTokenCount(stored({ [STORED_TOKEN_COUNT_KEY]: bad }), CONTENT, 'gpt-4o')).toBeNull()
    }
  })
})

describe('the honest limit of the length discriminator', () => {
  test('a same-length edit still passes — bug 1 is narrowed, not closed', () => {
    // A typo fix, a swapped word, changed punctuation: the count is stale and
    // this gate cannot tell. Documented in `lib/storedTokenCount`; a content hash
    // would catch it and was rejected on measured render-path cost (2.31 ms per
    // pass over the real book), not on any structural constraint.
    const sameLength = 'The Lion Sin of Pried'
    expect(sameLength.length).toBe(CONTENT.length)
    expect(readStoredTokenCount(stored(), sameLength, 'gpt-4o')).toEqual({ value: 7, exact: true })
  })

  test('the value is never dropped when validation fails, only demoted', () => {
    // Falling back to `length / 4` instead of the stored number would be a worse
    // guess *and* would hide that a real count exists.
    const result = readStoredTokenCount(stored(), `${CONTENT}!`, 'claude-sonnet-4')
    expect(result).not.toBeNull()
    expect(result?.value).toBe(7)
    expect(result?.exact).toBe(false)
  })
})
