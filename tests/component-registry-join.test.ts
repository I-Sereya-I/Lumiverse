import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import {
  EXCLUDED_PATHS,
  categoryFromPath,
  componentKeyFromPath,
  componentSelector,
  diffComponentRegistries,
  extractCssClasses,
  extractCssVariables,
  isComponentExportName,
  isExcludedPath,
  propsAliasForBasename,
  resolveComponentReference,
} from '../frontend/src/lib/componentRegistryJoin'
import GENERATED_COMPONENT_CSS from '../frontend/src/lib/generatedComponentCss'
import GENERATED_PROPS from '../frontend/src/lib/generatedComponentProps'

const joinSource = await Bun.file(
  new URL('../frontend/src/lib/componentRegistryJoin.ts', import.meta.url),
).text()
const registrySource = await Bun.file(
  new URL('../frontend/src/lib/cssModuleRegistry.ts', import.meta.url),
).text()
const generatorSource = await Bun.file(
  new URL('../frontend/scripts/extract-props.ts', import.meta.url),
).text()
const modalSource = await Bun.file(
  new URL('../frontend/src/components/modals/CustomCSSModal.tsx', import.meta.url),
).text()
const cssReferenceSource = await Bun.file(
  new URL('../frontend/src/components/modals/ComponentCssReference.tsx', import.meta.url),
).text()
const modalStrings = JSON.parse(
  await Bun.file(new URL('../frontend/src/i18n/locales/en/modals.json', import.meta.url)).text(),
)

// ─────────────────────────────────────────────────────────────────────────────
// The pure join rules
// ─────────────────────────────────────────────────────────────────────────────

describe('componentRegistryJoin — the joint key', () => {
  test('the key is the source-file basename, for both file kinds', () => {
    expect(componentKeyFromPath('/src/components/chat/InputArea.module.css')).toBe('InputArea')
    expect(componentKeyFromPath('/src/components/chat/InputArea.tsx')).toBe('InputArea')
    expect(componentKeyFromPath('/src/App.module.css')).toBe('App')
  })

  test('Windows separators from the Bun generator resolve to the same key as Vite paths', () => {
    // The generator hands over `G:\...\src\components\chat\InputArea.module.css`;
    // the registry hands over `/src/components/chat/InputArea.module.css`. If these
    // two disagreed the join would silently miss on every entry.
    expect(componentKeyFromPath('G:\\AI\\Lumiverse\\frontend\\src\\components\\chat\\InputArea.module.css'))
      .toBe(componentKeyFromPath('/src/components/chat/InputArea.module.css'))
  })

  test('the key is exactly what goes inside data-component', () => {
    expect(componentSelector('InputArea')).toBe('[data-component="InputArea"]')
    expect(componentSelector('InputArea', 'row')).toBe('[data-component="InputArea"][data-part="row"]')
  })

  test('categories come from the directory, with App as the top-level bucket', () => {
    expect(categoryFromPath('/src/components/chat/InputArea.module.css')).toBe('Chat')
    expect(categoryFromPath('/src/components/panels/theme-panel/AccentPicker.module.css')).toBe('Theme')
    expect(categoryFromPath('/src/App.module.css')).toBe('App')
    expect(categoryFromPath('G:\\repo\\frontend\\src\\components\\modals\\Foo.module.css')).toBe('Modals')
  })
})

describe('componentRegistryJoin — exclusions', () => {
  test('every excluded path is recognised through both separator styles', () => {
    for (const excluded of EXCLUDED_PATHS) {
      expect(isExcludedPath(`/src/components${excluded}Thing.module.css`)).toBe(true)
      expect(isExcludedPath(`G:\\repo\\src\\components${excluded.replace(/\//g, '\\')}Thing.module.css`)).toBe(true)
    }
  })

  test('the editor infrastructure and the auth screens stay out', () => {
    expect(isExcludedPath('/src/components/modals/CustomCSSModal.module.css')).toBe(true)
    expect(isExcludedPath('/src/components/panels/custom-css/CSSEditor.module.css')).toBe(true)
    expect(isExcludedPath('/src/components/auth/LoginPage.module.css')).toBe(true)
    expect(isExcludedPath('/src/components/chat/InputArea.module.css')).toBe(false)
  })
})

describe('componentRegistryJoin — export-name rules', () => {
  test('SCREAMING_SNAKE constants are not components', () => {
    expect(isComponentExportName('BubbleMessage')).toBe(true)
    expect(isComponentExportName('App')).toBe(true)
    expect(isComponentExportName('BUILD_TYPE_ICONS')).toBe(false)
    expect(isComponentExportName('DESIGN_DEFAULT_IDS')).toBe(false)
    expect(isComponentExportName('useThing')).toBe(false)
    expect(isComponentExportName('')).toBe(false)
  })

  test('a file basename borrows props only when the file exports exactly one component', () => {
    // PromptVariablesEditor.tsx exports VariablesEditor — unambiguous.
    expect(propsAliasForBasename('PromptVariablesEditor', ['VariablesEditor'])).toBe('VariablesEditor')
    // FormComponents.tsx exports ten things — guessing would be a lie.
    expect(propsAliasForBasename('FormComponents', ['Button', 'TextInput', 'Select'])).toBeNull()
    // Already matches by name, nothing to alias.
    expect(propsAliasForBasename('InputArea', ['InputArea'])).toBeNull()
    // Constants do not count towards the "exactly one" test.
    expect(propsAliasForBasename('Panel', ['PANEL_IDS', 'PanelBody'])).toBe('PanelBody')
    expect(propsAliasForBasename('Nothing', [])).toBeNull()
  })
})

describe('componentRegistryJoin — CSS introspection', () => {
  test('class selectors are collected in first-appearance order, without duplicates', () => {
    expect(extractCssClasses('.card { }\n.card:hover { }\n.card.active { }\n.row > .cell { }'))
      .toEqual(['card', 'active', 'row', 'cell'])
  })

  test('numeric literals are not class names', () => {
    // The old inline regex reported `5rem` and `2s` as source classes.
    const classes = extractCssClasses('.pad { padding: 0.5rem; transition: opacity .2s; width: 48.5%; }')
    expect(classes).toEqual(['pad'])
  })

  test('comments, url() payloads and string literals contribute nothing', () => {
    const classes = extractCssClasses(
      '/* .commented { } */\n.real { background: url(sprite.png); content: ".dotted"; }',
    )
    expect(classes).toEqual(['real'])
  })

  test('custom properties are collected, declarations and reads alike', () => {
    expect(extractCssVariables('.a { --local-gap: 4px; color: var(--lumiverse-primary); }'))
      .toEqual(['--local-gap', '--lumiverse-primary'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The resolution rule — a listed component never resolves to nothing
// ─────────────────────────────────────────────────────────────────────────────

describe('componentRegistryJoin — resolveComponentReference', () => {
  const CSS = { InputArea: '.row { --gap: 4px; color: var(--lumiverse-primary); }' }
  const PROPS = [{ name: 'chatId', type: 'string', description: 'The chat' }]

  test('both halves present', () => {
    const ref = resolveComponentReference('InputArea', CSS, PROPS)
    expect(ref.hasStylesheet).toBe(true)
    expect(ref.hasProps).toBe(true)
    expect(ref.classes).toEqual(['row'])
    expect(ref.vars).toEqual(['--gap', '--lumiverse-primary'])
    expect(ref.selector).toBe('[data-component="InputArea"]')
  })

  test('CSS but no props still resolves — the props half is flagged, not blank', () => {
    const ref = resolveComponentReference('InputArea', CSS, [])
    expect(ref.hasStylesheet).toBe(true)
    expect(ref.hasProps).toBe(false)
    expect(ref.props).toEqual([])
    expect(ref.classes.length).toBeGreaterThan(0)
  })

  test('props but no stylesheet still resolves — the CSS half is flagged, not blank', () => {
    const ref = resolveComponentReference('OrphanedThing', CSS, PROPS)
    expect(ref.hasStylesheet).toBe(false)
    expect(ref.cssContent).toBe('')
    expect(ref.classes).toEqual([])
    expect(ref.hasProps).toBe(true)
    // The one thing a user can always write against survives.
    expect(ref.selector).toBe('[data-component="OrphanedThing"]')
  })

  test('neither half present still yields a usable selector', () => {
    const ref = resolveComponentReference('Ghost', null, null)
    expect(ref.selector).toBe('[data-component="Ghost"]')
    expect(ref.hasStylesheet).toBe(false)
    expect(ref.hasProps).toBe(false)
  })

  test('a whitespace-only stylesheet counts as no stylesheet', () => {
    const ref = resolveComponentReference('Blank', { Blank: '   \n  ' }, null)
    expect(ref.hasStylesheet).toBe(false)
  })

  test('the returned props array is a copy, so a caller cannot mutate the registry', () => {
    const source = [...PROPS]
    const ref = resolveComponentReference('InputArea', CSS, source)
    ref.props.push({ name: 'injected', type: 'never', description: '' })
    expect(source).toHaveLength(1)
  })
})

describe('componentRegistryJoin — diffComponentRegistries', () => {
  test('reports both directions independently', () => {
    const diff = diffComponentRegistries(['A', 'B', 'C'], ['B', 'C', 'D'])
    expect(diff.missingFromGenerated).toEqual(['A'])
    expect(diff.unreachable).toEqual(['D'])
  })

  test('agreement is an empty diff', () => {
    const diff = diffComponentRegistries(['A', 'B'], ['B', 'A'])
    expect(diff).toEqual({ missingFromGenerated: [], unreachable: [] })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The guard — recompute the orphan set from the two registries, at test time
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rebuild the picker's key set the way `cssModuleRegistry.ts` does: glob every
 * `src/**` stylesheet, drop the excluded ones, key by basename.
 */
function pickerKeys(): string[] {
  const root = new URL('../frontend/', import.meta.url)
  const dir = decodeURIComponent(root.pathname.replace(/^\//, ''))
  const paths = Array.from(new Glob('src/**/*.module.css').scanSync({ cwd: dir }))
    .map((p) => `/${p.replace(/\\/g, '/')}`)
  expect(paths.length).toBeGreaterThan(100) // the glob actually found the tree
  return paths.filter((p) => !isExcludedPath(p)).map(componentKeyFromPath)
}

describe('the two registries agree — regression guard', () => {
  const keys = pickerKeys()

  test('no stylesheet the picker lists is missing from generatedComponentCss', () => {
    // These six were the orphans: App (outside the generator's old
    // `src/components/**` glob), FormComponents / PromptVariablesEditor /
    // MemoryCortexEditors (file name is not an exported symbol), and
    // LorebookEditorLayout / OOCStyles (stylesheets with no .tsx at all).
    // Every one of them rendered a reference pane claiming its stylesheet was empty.
    const { missingFromGenerated } = diffComponentRegistries(keys, Object.keys(GENERATED_COMPONENT_CSS))
    expect(missingFromGenerated).toEqual([])
  })

  test('generatedComponentCss ships nothing the picker cannot select', () => {
    // The generator used to emit CustomCSSModal, PropsReference, CSSEditor,
    // ModalShell, LoginPage, OperatorPanel & co — stylesheets EXCLUDED_PATHS
    // deliberately withholds from the picker.
    const { unreachable } = diffComponentRegistries(keys, Object.keys(GENERATED_COMPONENT_CSS))
    expect(unreachable).toEqual([])
  })

  test('every component the picker lists resolves to a non-blank reference pane', () => {
    const props = GENERATED_PROPS as Record<string, Array<{ name: string; type: string; description: string }>>
    const blank: string[] = []
    for (const key of keys) {
      const ref = resolveComponentReference(key, GENERATED_COMPONENT_CSS, props[key])
      // A pane is non-blank when it can show at least the root selector, and
      // in practice every listed entry now also has its stylesheet.
      if (!ref.selector || !ref.hasStylesheet) blank.push(key)
    }
    expect(blank).toEqual([])
  })

  test('the four components with no single-component props say so explicitly', () => {
    // Two have no .tsx at all, two are multi-export barrels — there is no honest
    // props contract to show, so the pane shows the CSS half plus a note.
    const props = GENERATED_PROPS as Record<string, unknown[]>
    const withoutProps = keys.filter((key) => !props[key]).sort()
    expect(withoutProps).toEqual([
      'FormComponents',
      'LorebookEditorLayout',
      'MemoryCortexEditors',
      'OOCStyles',
    ])
    for (const key of withoutProps) {
      const ref = resolveComponentReference(key, GENERATED_COMPONENT_CSS, props[key] as never)
      expect(ref.hasProps).toBe(false)
      expect(ref.hasStylesheet).toBe(true) // the half that exists is still shown
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Source-text guards — the wiring that keeps the two sides in step
// ─────────────────────────────────────────────────────────────────────────────

describe('the join rules have exactly one home', () => {
  test('cssModuleRegistry imports the rules instead of restating them', () => {
    expect(registrySource).toContain("from './componentRegistryJoin'")
    // A second copy of the exclusion list is how the two sides drifted apart.
    expect(registrySource).not.toContain("const EXCLUDED_PATHS = [")
    expect(registrySource).not.toContain('function nameFromPath')
    expect(registrySource).not.toContain('function categoryFromPath')
  })

  test('the generator applies the same key, the same glob and the same exclusions', () => {
    expect(generatorSource).toContain('from "../src/lib/componentRegistryJoin"')
    expect(generatorSource).toContain('new Glob("src/**/*.module.css")')
    // Narrowed to src/components/**, App.module.css was invisible to it.
    expect(generatorSource).toContain('new Glob("src/**/*.tsx")')
    expect(generatorSource).toContain('isExcludedPath')
    expect(generatorSource).toContain('componentKeyFromPath(cssPath)')
    // The old keying — CSS discovered by exported component name — is gone.
    expect(generatorSource).not.toContain('checkAndAddCss')
    expect(generatorSource).not.toContain('`${componentName}.module.css`')
  })

  test('the pure module stays importable from a Bun script and a test', () => {
    // No React, no store, no DOM, no import.meta.glob — otherwise the generator
    // and these tests could not load it.
    expect(joinSource).not.toMatch(/^import (?!type )/m)
    expect(joinSource).not.toContain('import.meta.glob')
  })
})

describe('the reference pane cannot render blank', () => {
  test('the modal no longer gates the pane on the generated data being present', () => {
    expect(modalSource).toContain('resolveComponentReference(selected, GENERATED_COMPONENT_CSS')
    expect(modalSource).not.toContain('showReference && !isGlobal && componentTemplate &&')
    expect(modalSource).toContain('showReference && !isGlobal && (')
  })

  test('the CSS pane has no early return — the component root is always rendered', () => {
    // The old component returned an "empty" stub before ever printing the
    // selector, which is the only thing that is always useful.
    expect((cssReferenceSource.match(/\breturn \(/g) ?? []).length).toBe(1)
    expect(cssReferenceSource).toContain("t('componentRoot')")
    expect(cssReferenceSource).toContain("t('noStylesheet'")
    // Pinned by tests/landing-page.test.ts and tests/homepage-character-library.test.ts.
    expect(cssReferenceSource).toContain('[data-component="${componentName}"]')
  })

  test('both empty states have real copy behind them', () => {
    expect(modalStrings.componentCssReference.noStylesheet).toContain('{{name}}')
    expect(modalStrings.componentCssReference.empty).toContain('{{name}}')
    expect(modalStrings.propsReference.noProps).toContain('{{name}}')
  })
})
