import { describe, expect, test } from 'bun:test'
import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * `ModalShell` used to declare a closed prop list with no rest-spread, so every
 * modal in the app was invisible to the Custom-CSS panel: that panel tells users
 * to write `[data-component="X"] { … }`, and the attribute was silently dropped
 * on the floor before it ever reached the DOM. These tests pin the fix — the
 * spread, where it lands, and the fact that no consumer drifts back out of it.
 *
 * There is no DOM test environment in this repo, so everything here reads source
 * text. The consumer list is discovered from the filesystem rather than written
 * down, so a new modal cannot quietly skip the annotation.
 */

const SRC = fileURLToPath(new URL('../frontend/src', import.meta.url)).replace(/\\/g, '/')

const shellSource = await Bun.file(`${SRC}/components/shared/ModalShell.tsx`).text()
const shellStyles = await Bun.file(`${SRC}/components/shared/ModalShell.module.css`).text()
const customizeSource = await Bun.file(
  `${SRC}/components/quick-toolbar/QuickToolbarCustomizeModal.tsx`,
).text()
const customizeStyles = await Bun.file(
  `${SRC}/components/quick-toolbar/QuickToolbarCustomizeModal.module.css`,
).text()

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = `${dir}/${name}`
    if (statSync(full).isDirectory()) walkTsx(full, out)
    else if (name.endsWith('.tsx')) out.push(full)
  }
  return out
}

/** Mirrors `cssModuleRegistry.nameFromPath` — the registry keys on the basename. */
function nameFromPath(p: string): string {
  return p.split(/[/\\]/).pop()!.replace(/\.(module\.css|tsx)$/, '')
}

/**
 * `CustomCSSModal` is listed in `cssModuleRegistry.EXCLUDED_PATHS` (overriding
 * the CSS editor's own chrome would brick the editor), so it is the one modal
 * with nothing to gain from the selector.
 */
const REGISTRY_EXCLUDED = new Set(['CustomCSSModal'])

/** Any `<ModalShell` render site, but not `<ModalShellSomethingElse`. */
const RENDER_SITE = /<ModalShell(?![A-Za-z0-9_])/g
/** A render site whose very next attribute is the `data-component` annotation. */
const ANNOTATED_SITE = /<ModalShell(?![A-Za-z0-9_])\s+data-component="([^"]+)"/g

interface Consumer {
  path: string
  name: string
  source: string
  sites: number
  annotations: string[]
}

const consumers: Consumer[] = []
for (const path of walkTsx(SRC).sort()) {
  const name = nameFromPath(path)
  if (name === 'ModalShell') continue
  const source = await Bun.file(path).text()
  const sites = source.match(RENDER_SITE)?.length ?? 0
  if (sites === 0) continue
  consumers.push({
    path: path.slice(SRC.length + 1).replace(/\\/g, '/'),
    name,
    source,
    sites,
    annotations: [...source.matchAll(ANNOTATED_SITE)].map((match) => match[1]),
  })
}

/** The opening `<motion.div …>` tag that renders the painted surface. */
const surfaceTag = (() => {
  const start = shellSource.indexOf('<motion.div', shellSource.indexOf('styles.backdrop'))
  expect(start).toBeGreaterThan(0)
  return shellSource.slice(start, shellSource.indexOf('>\n', start))
})()

describe('ModalShell — the prop list is open again', () => {
  test('the component destructures a rest and the type is rooted in div props', () => {
    // Without `...rest` the attribute is accepted by TS (hyphenated JSX names are
    // never checked) and then dropped at runtime — the exact silent failure.
    expect(shellSource).toContain('...rest')
    expect(shellSource).toContain("type ComponentPropsWithoutRef,")
    expect(shellSource).toMatch(
      /type ModalShellDOMProps = Omit<\s*ComponentPropsWithoutRef<'div'>,/,
    )
    expect(shellSource).toContain('export type ModalShellProps = ModalShellOwnProps & ModalShellDOMProps')
  })

  test('the explicit props are Omitted, so nothing can arrive down two paths', () => {
    const omit = shellSource.slice(
      shellSource.indexOf('type ModalShellDOMProps'),
      shellSource.indexOf('export type ModalShellProps'),
    )
    // `keyof ModalShellOwnProps` covers children/className/style at once.
    expect(omit).toContain('keyof ModalShellOwnProps')
    // Shell-owned a11y must not be re-declarable through the rest type either.
    expect(omit).toContain("| 'role'")
    expect(omit).toContain("| 'aria-modal'")
    // These are re-declared by motion with incompatible signatures.
    for (const handler of ['onDrag', 'onAnimationStart']) {
      expect(omit).toContain(`| '${handler}'`)
    }
    // The own-props interface still exists and still owns className/style.
    expect(shellSource).toMatch(/interface ModalShellOwnProps \{/)
    expect(shellSource).toContain('className?: string')
    expect(shellSource).toContain('style?: CSSProperties')
  })

  test('the spread lands on the surface element, not the backdrop', () => {
    // `.modal` is the box that paints background/border/shadow. A `data-component`
    // on the backdrop would make `[data-component="X"] { background: … }` repaint
    // the full-screen scrim instead of the dialog.
    expect(shellStyles).toMatch(/\.modal \{[^}]*background:/)
    expect(surfaceTag).toContain('clsx(styles.modal, className)')
    expect(surfaceTag).toContain('{...rest}')

    const backdropTag = shellSource.slice(
      shellSource.indexOf('<motion.div'),
      shellSource.indexOf('styles.backdrop') + 'styles.backdrop'.length,
    )
    expect(backdropTag).not.toContain('{...rest}')
    // Exactly one spread in the JSX — no accidental second landing spot. (The
    // doc comments name `{...rest}` in prose, so strip them before counting.)
    const shellCode = shellSource.replace(/\/\*[\s\S]*?\*\//g, '')
    expect((shellCode.match(/\{\.\.\.rest\}/g) ?? []).length).toBe(1)
  })

  test('className is merged, and the spread cannot clobber shell-owned attributes', () => {
    // clsx keeps `.modal` on the element; a bare `className={className}` would let
    // a caller erase the surface styling outright.
    expect(surfaceTag).toContain('className={clsx(styles.modal, className)}')
    expect(surfaceTag).not.toMatch(/className=\{className\}/)

    const spreadAt = surfaceTag.indexOf('{...rest}')
    expect(spreadAt).toBeGreaterThanOrEqual(0)
    for (const owned of ['className={clsx(', 'role="dialog"', 'aria-modal="true"', 'style={{']) {
      expect(surfaceTag.indexOf(owned)).toBeGreaterThan(spreadAt)
    }
    // The inline sizing still wins over a caller-supplied style object too.
    expect(surfaceTag).toContain('style={{ maxWidth, maxHeight, ...style }}')
  })
})

describe('ModalShell — every consumer exposes the documented selector', () => {
  test('the sweep actually found the modals', () => {
    expect(consumers.length).toBeGreaterThan(30)
    const names = consumers.map((c) => c.name)
    for (const expected of ['ConfirmationModal', 'InputPromptModal', 'QuickToolbarCustomizeModal']) {
      expect(names).toContain(expected)
    }
  })

  test('every render site carries data-component, and it matches the filename', () => {
    const missing: string[] = []
    const mismatched: string[] = []
    for (const consumer of consumers) {
      if (REGISTRY_EXCLUDED.has(consumer.name)) continue
      if (consumer.annotations.length !== consumer.sites) {
        missing.push(`${consumer.path} (${consumer.annotations.length}/${consumer.sites})`)
      }
      for (const value of consumer.annotations) {
        // cssModuleRegistry derives the component name from the file basename;
        // any other string leaves the Custom-CSS reference pane blank.
        if (value !== consumer.name) mismatched.push(`${consumer.path}: ${value}`)
      }
    }
    expect(missing).toEqual([])
    expect(mismatched).toEqual([])
  })

  test('files holding several dialogs annotate all of them', () => {
    // Both of these render four `ModalShell`s from one file, and all four share
    // the file's registry name.
    const multi = [
      'components/panels/memory-cortex/MemoryCortexEditors.tsx',
      'components/shared/WorldBookEntriesSection.tsx',
    ]
    for (const path of multi) {
      const consumer = consumers.find((c) => c.path === path)
      expect(consumer).toBeDefined()
      expect(consumer!.sites).toBeGreaterThan(1)
      expect(consumer!.annotations.length).toBe(consumer!.sites)
    }
  })
})

describe('QuickToolbarCustomizeModal — the wrapper workaround is retired', () => {
  test('the inner flex wrapper is gone and the shell carries the attribute', () => {
    expect(customizeSource).toContain('<ModalShell data-component="QuickToolbarCustomizeModal"')
    // The old workaround: a `.root` div that only re-created the shell's flex column.
    expect(customizeSource).not.toContain('className={styles.root}')
    expect(customizeSource).not.toContain('takes a fixed prop list')
    // Only one element may answer to the selector, or overrides apply twice.
    expect((customizeSource.match(/data-component="QuickToolbarCustomizeModal"/g) ?? []).length).toBe(1)
  })

  test('the dead .root rule left with it', () => {
    const live = customizeStyles.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(live).not.toMatch(/^\.root\s*\{/m)
    // The children it used to wrap are still the flex column's own items.
    expect(live).toMatch(/^\.header\s*\{/m)
    expect(live).toMatch(/^\.footer\s*\{/m)
    // ModalShell's surface supplies the column these now sit in.
    expect(shellStyles).toMatch(/\.modal \{[^}]*flex-direction: column/)
  })
})
