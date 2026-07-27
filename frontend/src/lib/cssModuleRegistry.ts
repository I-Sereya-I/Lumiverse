/**
 * Dynamic component registry — auto-discovered via import.meta.glob.
 *
 * Globs all *.module.css and *.tsx files under src/components/ (plus App,
 * LandingPage, LoginPage).  Pairs them by path so each entry knows both
 * its stylesheet and its source component file.
 *
 * Zero maintenance: new components are picked up automatically on rebuild.
 *
 * The naming/exclusion rules live in `componentRegistryJoin.ts` because
 * `scripts/extract-props.ts` has to apply exactly the same ones — when the two
 * disagreed, the picker listed components the generated data had no entry for.
 */

import {
  categoryFromPath,
  componentKeyFromPath,
  componentSelector,
  isExcludedPath,
} from './componentRegistryJoin'

export { EXCLUDED_PATHS } from './componentRegistryJoin'

// ── Glob discovery (lazy — no import cost, just path enumeration) ────
const cssModulePaths = Object.keys(
  import.meta.glob('/src/**/*.module.css', { eager: false }),
)
const tsxPaths = Object.keys(
  import.meta.glob('/src/**/*.tsx', { eager: false }),
)

// ── Build the registry ──────────────────────────────────────────────

export interface CSSModuleEntry {
  /** PascalCase component name derived from file path */
  component: string
  /** Display category derived from directory structure */
  category: string
  /** Path to the .module.css file */
  cssPath: string
  /** Path to the corresponding .tsx file (if found) */
  tsxPath: string | null
}

function buildRegistry(): CSSModuleEntry[] {
  // Index tsx files by their derived component name + directory for pairing
  const tsxByKey = new Map<string, string>()
  for (const p of tsxPaths) {
    const name = componentKeyFromPath(p)
    const dir = p.substring(0, p.lastIndexOf('/'))
    tsxByKey.set(`${dir}/${name}`, p)
  }

  const entries: CSSModuleEntry[] = []
  const seen = new Set<string>()

  for (const cssPath of cssModulePaths) {
    // Skip excluded paths
    if (isExcludedPath(cssPath)) continue

    const component = componentKeyFromPath(cssPath)

    // Skip duplicates (shouldn't happen, but guard)
    const key = `${categoryFromPath(cssPath)}:${component}`
    if (seen.has(key)) continue
    seen.add(key)

    // Try to find the matching .tsx in the same directory
    const dir = cssPath.substring(0, cssPath.lastIndexOf('/'))
    const tsxPath = tsxByKey.get(`${dir}/${component}`) ?? null

    entries.push({
      component,
      category: categoryFromPath(cssPath),
      cssPath,
      tsxPath,
    })
  }

  // Sort: categories alphabetically, components alphabetically within
  entries.sort((a, b) => a.category.localeCompare(b.category) || a.component.localeCompare(b.component))

  return entries
}

export const CSS_MODULE_REGISTRY: readonly CSSModuleEntry[] = buildRegistry()

/** Generate a CSS selector for targeting a component via data-component. */
export function generateSelector(entry: CSSModuleEntry, part?: string): string {
  return componentSelector(entry.component, part)
}
