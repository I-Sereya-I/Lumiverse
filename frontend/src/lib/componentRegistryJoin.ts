/**
 * The joint between the two component registries.
 *
 * There are two independent enumerations of "the components a user may override":
 *
 *   1. `cssModuleRegistry.ts` — runtime, a Vite glob of every `/src` stylesheet.
 *      This is what the Custom-CSS picker lists, and what `generateSelector()`
 *      turns into `[data-component="…"]`.  It is keyed by the *stylesheet file
 *      basename*.
 *   2. `scripts/extract-props.ts` — build time, walks the TypeScript AST and
 *      emits `generatedComponentProps.ts` / `generatedComponentCss.ts`.
 *
 * They used to disagree: the generator keyed its CSS output by *exported
 * component name*, so a stylesheet whose file name was not also an exported
 * symbol (`FormComponents.module.css`, `OOCStyles.module.css`, …) was listed by
 * the picker but had no entry in the generated map — and the reference pane
 * collapsed to "nothing found" for a stylesheet that plainly had content.
 *
 * This module owns the one key both sides must agree on — the **source-file
 * basename** — plus the exclusion list and the resolution rule the reference
 * pane uses.  It is deliberately free of React, the store, the DOM and
 * `import.meta`, so both the Bun generator script and the unit tests can import
 * it directly.
 */

import type { PropDoc } from './componentTemplates'

// ── The joint key ────────────────────────────────────────────────────

/** Normalise Windows separators so generator paths and Vite paths compare equal. */
function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

/**
 * Derive the component key from a file path.
 *
 * This is the *only* key the two registries are allowed to join on. It is also
 * what ends up inside `[data-component="…"]`, so it must stay a plain basename.
 */
export function componentKeyFromPath(p: string): string {
  const filename = toPosix(p).split('/').pop()!
  return filename.replace(/\.(module\.css|tsx)$/, '')
}

/** The selector the Custom-CSS panel documents for a component. */
export function componentSelector(componentName: string, part?: string): string {
  const base = `[data-component="${componentName}"]`
  return part ? `${base}[data-part="${part}"]` : base
}

/** Map directory segments to a display category. */
export function categoryFromPath(p: string): string {
  const posix = toPosix(p)
  // Vite hands over `/src/...`; the generator hands over an absolute OS path.
  const srcAt = posix.lastIndexOf('/src/')
  const path = srcAt >= 0 ? posix.slice(srcAt) : posix
  // Strip leading /src/components/ or /src/
  const rel = path.replace(/^\/src\/components\//, '').replace(/^\/src\//, '')
  const seg = rel.split('/')[0]

  const map: Record<string, string> = {
    chat: 'Chat',
    panels: 'Panels',
    modals: 'Modals',
    shared: 'Shared',
    settings: 'Settings',
    spindle: 'Spindle',
    auth: 'Auth',
    landing: 'Landing',
  }

  // Sub-directories inside panels (e.g. panels/theme-panel, panels/custom-css)
  if (seg === 'panels') {
    const sub = rel.split('/')[1]
    if (sub?.includes('-')) {
      // panels/theme-panel/AccentPicker → "Theme"
      const label = sub.replace(/-/g, ' ').replace(/\bpanel\b/i, '').trim()
      if (label) return label.charAt(0).toUpperCase() + label.slice(1)
    }
  }

  // Top-level files like App.module.css
  if (!path.includes('/components/')) return 'App'

  return map[seg] || seg.charAt(0).toUpperCase() + seg.slice(1)
}

// ── Exclusions (honoured by BOTH registries) ─────────────────────────

/**
 * Paths that are excluded from the override registry to prevent
 * self-referential overrides (overriding the editor breaks the editor)
 * or security-sensitive component overrides.
 *
 * The generator honours this too, so the shipped `generatedComponentCss.ts`
 * does not carry stylesheets the picker can never select.
 */
export const EXCLUDED_PATHS = [
  // Theme editor infrastructure — self-referential override would brick the UI
  '/custom-css/',
  '/modals/CustomCSSModal',
  '/modals/PropsReference',
  // Auth — overriding login could capture credentials
  '/auth/',
  // Modal infrastructure — overriding shells could break all modals
  '/shared/ModalShell',
  '/shared/ErrorBoundary',
  // Settings/operator — could expose admin controls
  '/settings/AccountSettings',
  '/settings/OperatorPanel',
  '/settings/UserManagement',
] as const

export function isExcludedPath(p: string): boolean {
  const path = toPosix(p)
  return EXCLUDED_PATHS.some((excluded) => path.includes(excluded))
}

// ── Export-name rules used by the generator ──────────────────────────

/**
 * Is this exported symbol plausibly a component?
 *
 * "Starts with a capital" alone also swept up module-level constants such as
 * `BUILD_TYPE_ICONS` and `DESIGN_DEFAULT_IDS`, which then sat in the generated
 * props map as components nobody could ever select.
 */
export function isComponentExportName(name: string): boolean {
  if (!name) return false
  if (name[0] !== name[0].toUpperCase() || !/^[A-Za-z]/.test(name)) return false
  // SCREAMING_SNAKE_CASE is a constant, never a component.
  return !/^[A-Z0-9_]+$/.test(name)
}

/**
 * Which export a file's *basename* should borrow its props contract from.
 *
 * The picker keys on the stylesheet basename, but props are keyed on the
 * exported symbol, and the two legitimately differ:
 * `PromptVariablesEditor.tsx` exports `VariablesEditor`. When a file exports
 * exactly one component there is no ambiguity, so the basename can alias it.
 * When it exports several (`FormComponents.tsx` exports ten) there is no honest
 * answer and the pane says so instead of guessing.
 */
export function propsAliasForBasename(
  basename: string,
  exportedComponentNames: readonly string[],
): string | null {
  const candidates = [...new Set(exportedComponentNames.filter(isComponentExportName))]
  if (candidates.includes(basename)) return null
  if (candidates.length !== 1) return null
  return candidates[0]
}

// ── Orphan detection ─────────────────────────────────────────────────

export interface RegistryDiff {
  /** Keys the picker lists that the generated map has no entry for. */
  missingFromGenerated: string[]
  /** Keys the generated map carries that the picker can never select. */
  unreachable: string[]
}

/**
 * Compare the picker's key set against a generated map's key set, both ways.
 *
 * A non-empty result in either direction is a bug: `missingFromGenerated`
 * means a listed component has no data to show, `unreachable` means we ship
 * bytes nobody can reach (and, for excluded paths, bytes we deliberately
 * withheld from the picker).
 */
export function diffComponentRegistries(
  pickerKeys: Iterable<string>,
  generatedKeys: Iterable<string>,
): RegistryDiff {
  const picker = new Set(pickerKeys)
  const generated = new Set(generatedKeys)
  return {
    missingFromGenerated: [...picker].filter((k) => !generated.has(k)).sort(),
    unreachable: [...generated].filter((k) => !picker.has(k)).sort(),
  }
}

// ── CSS introspection ────────────────────────────────────────────────

/**
 * Drop comments, `url(...)` payloads, string literals and decimal points before
 * scanning, so `background: url(a.png)`, `content: '.'` and `padding: 0.5rem`
 * cannot masquerade as class selectors.
 *
 * Only a dot *between two digits* is rewritten — class names may contain digits
 * (`.col2`), so digits themselves must survive.
 */
function stripNonSelectorNoise(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/url\([^)]*\)/g, ' ')
    .replace(/"[^"]*"|'[^']*'/g, ' ')
    .replace(/(\d)\.(\d)/g, '$1 $2')
}

/**
 * Every class name the stylesheet defines, in first-appearance order.
 *
 * A CSS identifier may not start with a digit, so `transition: .2s` and
 * `padding: 0.5rem` contribute nothing — which the old inline
 * `/\.([a-zA-Z0-9_-]+)/g` reported as the classes `2s` and `5rem`.
 */
export function extractCssClasses(css: string): string[] {
  const source = stripNonSelectorNoise(css)
  const found = new Set<string>()
  for (const match of source.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
    found.add(match[1])
  }
  return [...found]
}

/** Every custom property the stylesheet mentions, in first-appearance order. */
export function extractCssVariables(css: string): string[] {
  const source = stripNonSelectorNoise(css)
  const found = new Set<string>()
  for (const match of source.matchAll(/(--[a-zA-Z0-9_-]+)/g)) {
    found.add(match[1])
  }
  return [...found]
}

// ── The join the reference pane renders ──────────────────────────────

export interface ComponentReference {
  /** The picker key — also the `[data-component]` value. */
  component: string
  /** `[data-component="<component>"]` — always present, even with no data. */
  selector: string
  /** The component's stylesheet source, or `''` when none was extracted. */
  cssContent: string
  /** False when the generated CSS map has no entry for this component. */
  hasStylesheet: boolean
  classes: string[]
  vars: string[]
  props: PropDoc[]
  /** False when no props contract was extracted for this component. */
  hasProps: boolean
}

/**
 * Resolve everything the reference pane needs for one picker entry.
 *
 * Total by construction: every component the picker can list resolves to a
 * usable object. When half the data is missing the caller still gets the
 * selector plus a `hasStylesheet` / `hasProps` flag to render an explicit note
 * with — a silently blank pane is the bug this replaces.
 */
export function resolveComponentReference(
  component: string,
  cssByComponent: Readonly<Record<string, string>> | null | undefined,
  props: readonly PropDoc[] | null | undefined,
): ComponentReference {
  const raw = cssByComponent?.[component]
  const cssContent = typeof raw === 'string' ? raw : ''
  const hasStylesheet = cssContent.trim().length > 0
  const resolvedProps = props ? [...props] : []

  return {
    component,
    selector: componentSelector(component),
    cssContent,
    hasStylesheet,
    classes: hasStylesheet ? extractCssClasses(cssContent) : [],
    vars: hasStylesheet ? extractCssVariables(cssContent) : [],
    props: resolvedProps,
    hasProps: resolvedProps.length > 0,
  }
}
