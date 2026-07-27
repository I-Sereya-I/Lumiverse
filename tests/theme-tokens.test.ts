import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { fileURLToPath } from 'node:url'

const themeVariables = await Bun.file(
  new URL('../frontend/src/theme/variables.css', import.meta.url),
).text()
const themeEngine = await Bun.file(
  new URL('../frontend/src/theme/engine.ts', import.meta.url),
).text()
const tagColorsSource = await Bun.file(
  new URL('../frontend/src/lib/tagColors.ts', import.meta.url),
).text()
const appSource = await Bun.file(new URL('../frontend/src/App.tsx', import.meta.url)).text()
const chatViewSource = await Bun.file(
  new URL('../frontend/src/components/chat/ChatView.tsx', import.meta.url),
).text()

/** CSS comments are not declarations. A comment naming a token must not count as
 *  defining it, and a commented-out rule must not count as reading it. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

const definedTokens = new Set(
  [...stripComments(themeVariables).matchAll(/(--lumiverse-[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]),
)

/** The declared value of a token in `variables.css`, comments stripped. */
function declaredValue(token: string): string | undefined {
  const match = stripComments(themeVariables).match(
    new RegExp(`${token}\\s*:\\s*([^;]+);`),
  )
  return match?.[1].trim()
}

const cssRoot = fileURLToPath(new URL('../frontend/src/', import.meta.url))
const cssFiles = Array.from(new Glob('**/*.css').scanSync({ cwd: cssRoot, absolute: true }))
  .map((absolute) => absolute.split('\\').join('/'))
  .filter((absolute) => !absolute.endsWith('/theme/variables.css'))
  .sort()

/**
 * Inline `style={{ … }}` and template-literal CSS in components read theme tokens
 * too, and a phantom hides *better* there than in a stylesheet — this sweep was
 * CSS-only when it was written, which is exactly why
 * `--lumiverse-surface-muted` (two reads in `chat/InputArea.tsx`) was missing
 * from the original backlog while its twenty CSS-side siblings were listed.
 *
 * `lib/generated*.ts` is excluded: those files are machine-written copies of the
 * very stylesheets already scanned above, so every token in them is either
 * already covered or a stale duplicate of one — and they must never be
 * hand-edited, so a finding there would be unactionable.
 */
const sourceFiles = Array.from(new Glob('**/*.{ts,tsx}').scanSync({ cwd: cssRoot, absolute: true }))
  .map((absolute) => absolute.split('\\').join('/'))
  .filter((absolute) => !/\/lib\/generated[A-Za-z]*\.ts$/.test(absolute))
  .sort()

/**
 * Every `var(--lumiverse-…)` read in app CSS *and* app source, with or without a
 * fallback, keyed by token name → the files that read it.
 *
 * The token name must be followed by `,` or `)` — the real `var()` grammar. That
 * is what keeps `` var(--lumiverse-tag-${slot}) `` in `lib/tagColors.ts` from
 * registering as a read of a token literally named `--lumiverse-tag-`.
 */
const tokenReads = new Map<string, Set<string>>()
for (const absolute of [...cssFiles, ...sourceFiles]) {
  const source = stripComments(await Bun.file(absolute).text())
  const relative = absolute.slice(absolute.indexOf('/frontend/src/') + 1)
  for (const match of source.matchAll(/var\(\s*(--lumiverse-[a-zA-Z0-9-]+)\s*[,)]/g)) {
    if (!tokenReads.has(match[1])) tokenReads.set(match[1], new Set())
    tokenReads.get(match[1])!.add(relative)
  }
}

/**
 * Tokens that are read but deliberately absent from `variables.css`.
 *
 * `ENGINE_ONLY` — emitted at runtime by `theme/engine.ts` onto
 * `documentElement`, so they always resolve in the app. They are invisible to
 * `scripts/extract-css-vars.ts` (which scrapes the `:root` block of
 * `variables.css` only), which is why they look undefined to a source scan.
 * Asserted against `engine.ts` below, so this list cannot rot.
 *
 * `RUNTIME_SCOPED` — written inline on one element by a component and
 * intentionally left unset in some states, so the fallback in the `var()` is
 * load-bearing. Defining them at `:root` would break the unset state.
 * Asserted against their writer below.
 *
 * `KNOWN_PHANTOMS` — tokens read with a fallback and defined nowhere at all, so
 * each silently opts its declaration out of theming forever. **Now empty**, and
 * it must stay that way: the sweep below treats a two-arg `var(--lumiverse-x,
 * <literal>)` naming an undefined token exactly like a bare one. Adding an entry
 * here is not a fix, it is a waiver, and it needs a comment saying why the token
 * cannot be defined safely in both light and dark mode.
 */
const ENGINE_ONLY = ['--lumiverse-prose-link'] as const

const RUNTIME_SCOPED: ReadonlyArray<{ token: string; writer: string; source: string }> = [
  // App.tsx sets this for the three capped modal-width modes and REMOVES it for
  // `full`, so `var(--lumiverse-content-max-width, <literal>)` must keep resolving
  // to its fallback.
  { token: '--lumiverse-content-max-width', writer: 'frontend/src/App.tsx', source: appSource },
]

const KNOWN_PHANTOMS: readonly string[] = []

/** Tokens the plan requires `variables.css` to define. Listing one of these in
 *  an allow-list above would defeat the point, so that is checked too. */
const CONTRACT_TOKENS = [
  '--lumiverse-surface',
  '--lumiverse-surface-raised',
  '--lumiverse-surface-hover',
  '--lumiverse-border-subtle',
  '--lumiverse-primary-soft',
  '--lumiverse-input-bg',
  '--lumiverse-bg-panel',
  '--lumiverse-primary-040',
  '--lumiverse-text-secondary',
  '--lumiverse-accent',
  '--lumiverse-chat-content-width',
  ...Array.from({ length: 12 }, (_, i) => `--lumiverse-tag-${i + 1}`),
] as const

/**
 * The seven contract tokens that started life as hard-coded Tailwind-slate
 * literals and were repointed onto the theme. Kept separate from the three
 * tokens that were aliases from day one (`--lumiverse-bg-panel`,
 * `--lumiverse-text-secondary`, `--lumiverse-accent`) and from
 * `--lumiverse-chat-content-width`, which must stay the literal `none`.
 */
const REPOINTED_TOKENS = [
  '--lumiverse-surface',
  '--lumiverse-surface-raised',
  '--lumiverse-surface-hover',
  '--lumiverse-border-subtle',
  '--lumiverse-primary-soft',
  '--lumiverse-input-bg',
  '--lumiverse-primary-040',
] as const

describe('theme token contract', () => {
  test('every contract token is defined in variables.css', () => {
    expect(CONTRACT_TOKENS.filter((token) => !definedTokens.has(token))).toEqual([])
  })

  test('no contract token is excused by an allow-list', () => {
    const excused = new Set<string>([
      ...ENGINE_ONLY,
      ...RUNTIME_SCOPED.map((entry) => entry.token),
      ...KNOWN_PHANTOMS,
    ])
    expect(CONTRACT_TOKENS.filter((token) => excused.has(token))).toEqual([])
  })

  test('the surface family is theme-derived, not a frozen literal', () => {
    // These seven were first defined at the Tailwind-slate literals their call
    // sites used to render, which made them *reachable* by Custom CSS but not
    // *theme-tracking*: a purple (or teal, or light-mode) theme still got a slate
    // app. They are now aliases onto the engine's ladder. A bare literal here
    // silently reverts that for every consumer at once — QuickToolbar,
    // HomepageCharacterLibrary, PortraitDock, RegexPanel, LoomBuilder, the
    // Settings modal — so the shape of the value is pinned, not its colour.
    for (const token of REPOINTED_TOKENS) {
      expect(declaredValue(token)).toMatch(/^var\(\s*--lumiverse-[a-zA-Z0-9-]+\s*\)$/)
    }
  })

  test('each repointed token resolves through a token the engine really emits', () => {
    // `variables.css` is a DARK-ONLY static block; `theme/engine.ts` writes inline
    // on documentElement and therefore wins. An alias only inherits light mode if
    // its target is engine-emitted — aliasing onto another dark-only literal in
    // this file would leave the token frozen at a dark value in light mode, which
    // is the exact bug the repoint was meant to fix.
    const frozenInLightMode = REPOINTED_TOKENS.filter((token) => {
      const target = declaredValue(token)!.replace(/^var\(\s*|\s*\)$/g, '')
      return !themeEngine.includes(`vars['${target}']`)
    })
    expect(frozenInLightMode).toEqual([])
  })

  test('the alias tokens stay aliases so the theme engine still reaches them', () => {
    const declarations = stripComments(themeVariables)
    expect(declarations).toContain('--lumiverse-bg-panel: var(--lumiverse-bg);')
    expect(declarations).toContain('--lumiverse-text-secondary: var(--lumiverse-text-muted);')
    expect(declarations).toContain('--lumiverse-accent: var(--lumiverse-primary);')
  })

  test('--lumiverse-chat-content-width stays `none` so full-width chat is uncapped', () => {
    // ChatView writes a length inline for comfortable/compact/custom and writes
    // nothing for the default mode. A length here would cap that default.
    expect(stripComments(themeVariables)).toContain('--lumiverse-chat-content-width: none;')
    expect(chatViewSource).toContain("'--lumiverse-chat-content-width'")
  })
})

describe('tag palette tokens', () => {
  /**
   * The hues that used to be the literal PALETTE array in lib/tagColors.ts.
   * Pinned here because the slot → colour mapping is now the token's job: a tag
   * keeps its slot forever (the hash and the 12-slot modulo are frozen in
   * tagColors.ts), so silently editing a value here re-tints live tag chips.
   */
  const PALETTE_TRIPLES = [
    '147, 112, 219',
    '72, 160, 220',
    '80, 200, 160',
    '240, 180, 80',
    '220, 100, 120',
    '100, 180, 240',
    '200, 140, 220',
    '120, 210, 200',
    '240, 150, 100',
    '160, 200, 100',
    '220, 160, 180',
    '140, 170, 220',
  ] as const

  test('each tag token is a bare R, G, B triple, not a colour', () => {
    // The triple form (no rgb()/rgba() wrapper) is the contract: the consumer
    // supplies its own alpha — rgba(var(--lumiverse-tag-1), 0.15) for the chip
    // fill, 0.3 for its border, rgb(var(--lumiverse-tag-1)) for solid use.
    const declarations = stripComments(themeVariables)
    PALETTE_TRIPLES.forEach((triple, index) => {
      expect(declarations).toContain(`--lumiverse-tag-${index + 1}: ${triple};`)
    })
  })

  test('lib/tagColors.ts resolves slots to the tokens rather than literal colours', () => {
    // Inline JS-computed rgba() outranks the user's Custom CSS; token references
    // do not. Losing this handshake silently makes tag chips unstyleable again.
    expect(tagColorsSource).toContain('var(--lumiverse-tag-')
    expect(tagColorsSource).not.toMatch(/bg:\s*'rgba\(\d/)
  })
})

describe('no new phantom tokens', () => {
  test('the sweep actually found CSS to sweep', () => {
    expect(cssFiles.length).toBeGreaterThan(100)
    expect(tokenReads.size).toBeGreaterThan(50)
  })

  test('every allow-listed engine-only token is really emitted by engine.ts', () => {
    for (const token of ENGINE_ONLY) {
      expect(themeEngine).toContain(`vars['${token}']`)
    }
  })

  test('every allow-listed runtime-scoped token is really written by its component', () => {
    for (const entry of RUNTIME_SCOPED) {
      expect(entry.source).toContain(entry.token)
    }
  })

  test('every --lumiverse-* token read in app CSS or source is defined or excused', () => {
    // This is the hole that tests/quick-toolbar.test.ts leaves open: that lint
    // only forbids BARE `var(--lumiverse-x)` reads, so `var(--lumiverse-x,
    // #literal)` was a sanctioned way to reference a token that does not exist —
    // and it renders from the literal forever, untouchable by any theme layer.
    // `tokenReads` deliberately does not care whether a fallback was supplied, so
    // the two-arg form buys nothing here: an undefined token fails either way.
    const excused = new Set<string>([
      ...ENGINE_ONLY,
      ...RUNTIME_SCOPED.map((entry) => entry.token),
      ...KNOWN_PHANTOMS,
    ])
    const undefinedReads = [...tokenReads.keys()]
      .filter((token) => !definedTokens.has(token) && !excused.has(token))
      .sort()
    expect(undefinedReads).toEqual([])
  })

  test('a fallback cannot smuggle an undefined token past the sweep', () => {
    // Pins the mechanism the test above relies on, so a future "simplification"
    // of the read regex to `var\(\s*(--lumiverse-[\w-]+)\s*\)` — which would
    // re-open the escape hatch and silently re-empty the sweep — fails here
    // instead of passing quietly.
    const readRegex = /var\(\s*(--lumiverse-[a-zA-Z0-9-]+)\s*[,)]/g
    const withFallback = 'color: var(--lumiverse-not-a-real-token, #42a5f5);'
    expect([...withFallback.matchAll(readRegex)].map((m) => m[1])).toEqual([
      '--lumiverse-not-a-real-token',
    ])
    // …and the template-literal form in lib/tagColors.ts still must NOT register,
    // because `--lumiverse-tag-` is not a token, it is a prefix.
    expect([...'var(--lumiverse-tag-${slot})'.matchAll(readRegex)]).toEqual([])
  })

  test('the KNOWN_PHANTOMS backlog only lists tokens that are still phantoms', () => {
    // Keeps the list honest: once a phantom is defined in variables.css it must
    // be removed from the backlog rather than lingering as a blanket excuse.
    expect(KNOWN_PHANTOMS.filter((token) => definedTokens.has(token))).toEqual([])
  })

  test('the phantom backlog is empty', () => {
    // The backlog is drained. A new entry is a waiver, not a fix — it needs a
    // comment on the entry explaining why the token cannot be given a value that
    // is correct in BOTH light and dark mode, and this assertion updated
    // deliberately rather than as a side effect of making a sweep failure go away.
    expect(KNOWN_PHANTOMS).toEqual([])
  })
})

describe('the --lcs-* namespace has a static default for every engine token', () => {
  test('no --lcs-* token is engine-only', () => {
    // `variables.css` is what paints before `useThemeApplicator` runs. A token the
    // engine emits but this file omits is invalid-at-computed-value-time until
    // then, so the declaration reading it drops entirely — a borderless /
    // unblurred flash. `--lcs-glass-bg-hover` and `--lcs-glass-border-hover` were
    // both in that state while ConnectionsPicker.module.css read them bare.
    const declared = new Set(
      [...stripComments(themeVariables).matchAll(/(--lcs-[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]),
    )
    const emitted = [...themeEngine.matchAll(/vars\['(--lcs-[a-zA-Z0-9-]+)'\]\s*=/g)].map(
      (m) => m[1],
    )
    expect([...new Set(emitted)].filter((token) => !declared.has(token)).sort()).toEqual([])
  })
})

describe('the stacking ladder', () => {
  const rungs = new Map(
    [...stripComments(themeVariables).matchAll(/(--z-[a-zA-Z0-9-]+)\s*:\s*(\d+)\s*;/g)].map(
      (m) => [m[1], Number(m[2])] as const,
    ),
  )

  test('no rung uses the forbidden 10012', () => {
    // tests/lore-indicator.test.ts:361 treats 10012 as forbidden.
    expect([...rungs].filter(([, value]) => value === 10012)).toEqual([])
  })

  test('the viewport-level rungs sit where the ladder comment says they do', () => {
    // Literals documented in the block comment, repeated here so a rung cannot be
    // added at a value that buries it under — or floats it over — the wrong layer.
    const VIEWPORT_DRAWER = 9992
    const SETTINGS_MODAL = 10001

    // Homepage pinned preview: page-level, must stay under the drawer.
    expect(rungs.get('--z-homepage-preview-panel')).toBe(9990)
    expect(rungs.get('--z-homepage-preview-panel')!).toBeLessThan(VIEWPORT_DRAWER)

    // Connections picker: a draggable utility panel used *with* the drawer open,
    // so above it — but never over a modal that owns the screen.
    const picker = rungs.get('--z-connections-picker')!
    expect(picker).toBeGreaterThan(VIEWPORT_DRAWER)
    expect(picker).toBeLessThan(SETTINGS_MODAL)
  })

  test('every rung is unique, so two layers can never tie', () => {
    const values = [...rungs.values()]
    expect(values.length).toBeGreaterThan(4)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('variables.css stays machine-readable', () => {
  test('the :root block has no nested braces', () => {
    // scripts/extract-css-vars.ts matches /:root\s*{([^}]+)}/ — the FIRST :root
    // block, and `[^}]+` truncates at the first inner `}`. Nesting an @media or
    // @supports inside :root would silently drop every token after it from
    // lib/generatedCssVariables.ts.
    const rootBlock = stripComments(themeVariables).match(/:root\s*\{([\s\S]*?)\}/)
    expect(rootBlock).not.toBeNull()
    expect(rootBlock![1]).not.toContain('{')
    for (const token of CONTRACT_TOKENS) {
      expect(rootBlock![1]).toContain(`${token}:`)
    }
  })
})
