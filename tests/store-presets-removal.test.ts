import { describe, expect, test } from 'bun:test'

/**
 * Regression guard for the removal of the dead `activePresetId` /
 * `setActivePreset` members of the zustand `PresetsSlice`.
 *
 * Nothing ever called `setActivePreset`, so `activePresetId` was permanently
 * `null` and every read of it resolved to `undefined`. Generation resolves the
 * live preset through `getActivePresetForGeneration()`, which returns
 * `activeLoomPresetId`.
 *
 * These identifiers are NOT globally banned — several *live, unrelated* things
 * share the name and must keep working:
 *   - `frontend/src/hooks/useLoomBuilder.ts` has a local React
 *     `const [activePreset, setActivePreset] = useState(...)`.
 *   - `LoomBuilder.tsx` / `RegexPanel.tsx` take an `activePresetId` **prop**
 *     that is fed from `activeLoomPresetId`.
 *   - `frontend/src/store/slices/regex.ts` uses a local `const activePresetId`
 *     derived from `activeLoomPresetId`.
 *   - `frontend/src/api/regex.ts` takes an `activePresetId` argument.
 *   - the backend `src/services/regex-scripts.service.ts` reads
 *     `context?.activePresetId` off the regex-script call context.
 *
 * So the guard bans exactly the two things that would resurrect the slice:
 * declaring the members on the store, and reading them *off* the store.
 *
 * Source-text assertions, like the rest of `tests/` — there is no DOM here and
 * the store module pulls in `window`.
 */

const root = new URL('../', import.meta.url)

const presetsSliceSource = await Bun.file(
  new URL('frontend/src/store/slices/presets.ts', root),
).text()
const storeTypesSource = await Bun.file(
  new URL('frontend/src/types/store.ts', root),
).text()

/** Every frontend source file, as [repo-relative path, text]. */
const frontendSources: Array<[string, string]> = []
for await (const rel of new Bun.Glob('**/*.{ts,tsx}').scan({
  cwd: new URL('frontend/src', root).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
})) {
  const path = `frontend/src/${rel.replace(/\\/g, '/')}`
  frontendSources.push([path, await Bun.file(new URL(path, root)).text()])
}

/** The body of the `PresetsSlice` interface in `types/store.ts`. */
function presetsSliceInterface(): string {
  const start = storeTypesSource.indexOf('export interface PresetsSlice {')
  expect(start).toBeGreaterThan(-1)
  const end = storeTypesSource.indexOf('\n}', start)
  expect(end).toBeGreaterThan(start)
  return storeTypesSource.slice(start, end)
}

describe('dead presets store slice stays removed', () => {
  test('the test corpus actually loaded', () => {
    // Guards the guard: a broken glob would make every assertion below vacuous.
    expect(frontendSources.length).toBeGreaterThan(100)
    expect(frontendSources.some(([p]) => p === 'frontend/src/store/slices/presets.ts')).toBe(true)
  })

  test('the slice implementation declares neither member', () => {
    expect(presetsSliceSource).not.toMatch(/\bactivePresetId\b/)
    expect(presetsSliceSource).not.toMatch(/\bsetActivePreset\b/)
  })

  test('the PresetsSlice type declares neither member', () => {
    const iface = presetsSliceInterface()
    expect(iface).not.toMatch(/\bactivePresetId\b/)
    expect(iface).not.toMatch(/\bsetActivePreset\b/)
  })

  test('no frontend file reads either member off the store', () => {
    // Property access is the only way to reach store state, so `.activePresetId`
    // / `.setActivePreset` anywhere in the frontend means the slice came back.
    // `useLoomBuilder`'s local `setActivePreset` is a bare identifier and a
    // `setActivePreset(...)` call, never a property read, so it is not matched.
    const offenders = frontendSources.filter(([, text]) =>
      /\.\s*(activePresetId|setActivePreset)\b/.test(text),
    )
    expect(offenders.map(([path]) => path)).toEqual([])
  })

  test('no frontend file selects or destructures either member from useStore', () => {
    const offenders: string[] = []
    for (const [path, text] of frontendSources) {
      for (const line of text.split('\n')) {
        if (!/\buseStore\b|\bgetState\(\)/.test(line)) continue
        if (/\b(activePresetId|setActivePreset)\b/.test(line)) offenders.push(path)
      }
    }
    expect(offenders).toEqual([])
  })

  test('the live loom preset machinery is untouched', () => {
    // The counterpart to the bans above: if this slice ever loses these, the
    // deletion went too far and generation silently stops resolving a preset.
    expect(presetsSliceSource).toMatch(/\bactiveLoomPresetId\b/)
    expect(presetsSliceSource).toMatch(/\bsetActiveLoomPreset\b/)
    expect(presetsSliceSource).toMatch(/getActivePresetForGeneration/)
    const iface = presetsSliceInterface()
    expect(iface).toMatch(/\bactiveLoomPresetId\b/)
    expect(iface).toMatch(/getActivePresetForGeneration/)
  })

  test('neither member is persisted in DATA_KEYS', async () => {
    const settingsSource = await Bun.file(
      new URL('frontend/src/store/slices/settings.ts', root),
    ).text()
    const start = settingsSource.indexOf('const DATA_KEYS: ReadonlySet<string> = new Set([')
    expect(start).toBeGreaterThan(-1)
    const dataKeys = settingsSource.slice(start, settingsSource.indexOf('])', start))
    expect(dataKeys).not.toMatch(/'activePresetId'/)
    expect(dataKeys).not.toMatch(/'presets'/)
    // `activeLoomPresetId` is the persisted one and must stay.
    expect(dataKeys).toMatch(/'activeLoomPresetId'/)
  })
})
