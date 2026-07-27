import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Hash } from 'lucide-react'
import { Spinner } from '@/components/shared/Spinner'
import { Toggle } from '@/components/shared/Toggle'
import { ExpandableTextarea } from '@/components/shared/ExpandedTextEditor'
import clsx from 'clsx'
import type { WorldBookEntry } from '@/types/api'
import { getVectorIndexStatusDescription, getVectorIndexStatusLabel } from '@/lib/worldBookVectorization'
import { useWorldBookEntryLabels } from '@/lib/i18n/worldBookEntryLabels'
import { estimateTokens } from '@/lib/tokenEstimate'
import { getTokenCount as readCachedTokenCount, tokenCacheKey } from '@/lib/tokenCountCache'
import { getTokenCountScheduler } from '@/hooks/useTokenCounts'
import { shouldCountOpenEntryImmediately } from '@/lib/tokenPrefetchPlan'
import { DEFAULT_LOREBOOK_EDITOR_SETTINGS } from '@/lib/uiProductivityDefaults'
import { useStore } from '@/store'
import NumberStepper from './NumberStepper'
import styles from './WorldBookEntryEditor.module.css'

export interface EntryEditorProps {
  entry: WorldBookEntry
  onUpdate: (id: string, updates: Record<string, any>) => void
  onImmediateUpdate: (id: string, updates: Record<string, any>) => void
  density?: 'default' | 'compact'
  /**
   * Let the content field consume every pixel the host pane leaves over
   * instead of sitting at a fixed height. Used by the lorebook editors, where
   * content is the dominant field.
   */
  fillContent?: boolean
}

export default function WorldBookEntryEditor({
  entry,
  onUpdate,
  onImmediateUpdate,
  density = 'default',
  fillContent = false,
}: EntryEditorProps) {
  const { t } = useTranslation('panels', { keyPrefix: 'worldBookPanel.entryEditor' })
  const { positionOptions, roleOptions, selectiveLogicOptions } = useWorldBookEntryLabels()

  const [groupOpen, setGroupOpen] = useState(false)
  const [timingOpen, setTimingOpen] = useState(false)
  const [recursionOpen, setRecursionOpen] = useState(false)
  const [metadataOpen, setMetadataOpen] = useState(false)
  const recursionInvalidated = entry.vectorized
  const vectorStatusClass =
    entry.vector_index_status === 'indexed'
      ? styles.vectorStatusIndexed
      : entry.vector_index_status === 'error'
        ? styles.vectorStatusError
        : entry.vector_index_status === 'pending'
          ? styles.vectorStatusPending
          : styles.vectorStatusNotEnabled

  // Token count state
  const [tokenCounting, setTokenCounting] = useState(false)
  const [tokenCount, setTokenCount] = useState<number | null>(null)
  const [tokenCountApprox, setTokenCountApprox] = useState(false)
  const activeProfileId = useStore((s) => s.activeProfileId)
  const profiles = useStore((s) => s.profiles)
  const tokenCountMode = useStore((s) => s.lorebookEditorSettings.tokenCountMode)
    ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountMode
  const tokenCountDelayMs = useStore((s) => s.lorebookEditorSettings.tokenCountDelayMs)
    ?? DEFAULT_LOREBOOK_EDITOR_SETTINGS.tokenCountDelayMs

  // Local state for text fields to prevent prop-sync from overwriting in-progress edits
  const [content, setContent] = useState(entry.content)
  const [comment, setComment] = useState(entry.comment)
  const [outletName, setOutletName] = useState(entry.outlet_name || '')
  const [primaryKeys, setPrimaryKeys] = useState(entry.key.join(', '))
  const [secondaryKeys, setSecondaryKeys] = useState(entry.keysecondary.join(', '))
  const lastSyncedId = useRef<string | null>(null)
  const autoCountedId = useRef<string | null>(null)
  /** The entry id the display-only open count has already fired for. */
  const openCountedId = useRef<string | null>(null)
  const tokenRequestId = useRef(0)

  /**
   * Writes the count back to the server — and is therefore the only place in the
   * token pipeline that bumps `revision`.
   *
   * The exactness gate lives **here**, at the top, not at the three call sites.
   * One of those call sites passes the *variable* `next.approximate`, so a source
   * grep for a literal `true` cannot see the branch that fires most often, and a
   * guard placed per-call-site would be one refactor away from leaking again.
   * Every `length / 4` fallback — no model, `token_count: null`, request error —
   * now stays on the client, where it costs nothing and records nothing the
   * client did not already know.
   *
   * `length` is `content.length` of the text that was actually counted. It is
   * what lets a reader tell a live count from one left behind by an edit — the
   * save path writes `content` without touching `extensions`, so without it a
   * stale number is indistinguishable from a current one and renders as exact.
   * `lib/storedTokenCount` is the reader, and documents honestly how weak a
   * discriminator length is.
   */
  const persistTokenCount = useCallback((count: number, approximate: boolean, model: string | null, length: number) => {
    if (approximate) return
    const currentCount = Number(entry.extensions?._lumiverse_token_count)
    const currentApproximate = !!entry.extensions?._lumiverse_token_count_approximate
    const currentModel = entry.extensions?._lumiverse_token_count_model ?? null
    const currentLength = Number(entry.extensions?._lumiverse_token_count_len)
    if (
      currentCount === count
      && currentApproximate === approximate
      && currentModel === model
      && currentLength === length
    ) {
      return
    }
    onImmediateUpdate(entry.id, {
      extensions: {
        ...entry.extensions,
        _lumiverse_token_count: count,
        _lumiverse_token_count_approximate: approximate,
        _lumiverse_token_count_model: model,
        _lumiverse_token_count_len: length,
      },
    })
  }, [entry.extensions, entry.id, onImmediateUpdate])

  // Sync from entry prop only when switching to a different entry
  useEffect(() => {
    if (lastSyncedId.current === entry.id) return
    lastSyncedId.current = entry.id
    autoCountedId.current = null
    openCountedId.current = null
    setContent(entry.content)
    setComment(entry.comment)
    setOutletName(entry.outlet_name || '')
    setPrimaryKeys(entry.key.join(', '))
    setSecondaryKeys(entry.keysecondary.join(', '))
    setTokenCount(null)
    setTokenCountApprox(false)
  }, [entry])

  /**
   * Resolves the open entry's count. Returns whether it reached a conclusion, so
   * the caller only marks an entry auto-counted when it actually was.
   *
   * Cache-first against the shared session cache rather than a `useRef` Map that
   * died with every remount: if the hover prefetch already counted this text, the
   * value is here and `delayed` mode can persist immediately with no request at
   * all. The request itself goes through the shared scheduler, so a hover that is
   * still in flight when the user clicks is joined rather than duplicated.
   *
   * `persist: false` makes the whole pass read-only — the number is displayed and
   * nothing is written back. That is what lets the *display* skip
   * `tokenCountDelayMs` on a fresh open (see the effect below) without also moving
   * the write forward: arrowing quickly down a list would otherwise land one
   * `revision` bump per entry passed, which is the regression the delay was added
   * to remove in the first place. Display now, save on the timer, exactly as before.
   */
  const resolveTokenCount = useCallback(async (
    targetContent: string,
    mode: 'manual' | 'auto',
    { persist = true }: { persist?: boolean } = {},
  ): Promise<boolean> => {
    const trimmed = targetContent.trim()
    const requestId = ++tokenRequestId.current
    if (!trimmed) {
      setTokenCounting(false)
      setTokenCount(null)
      setTokenCountApprox(false)
      return true
    }

    const profile = profiles.find(p => p.id === activeProfileId) || profiles.find(p => p.is_default)
    const model = profile?.model ?? null

    const cached = readCachedTokenCount(model, targetContent)
    if (cached) {
      setTokenCount(cached.count)
      setTokenCountApprox(cached.approximate)
      setTokenCounting(false)
      if (persist) persistTokenCount(cached.count, cached.approximate, cached.model, targetContent.length)
      return true
    }

    if (mode === 'auto') {
      setTokenCount(estimateTokens(targetContent))
      setTokenCountApprox(true)
    }
    setTokenCounting(true)

    try {
      const outcome = await getTokenCountScheduler().request({
        key: tokenCacheKey(model, targetContent),
        text: targetContent,
        model,
        priority: 'interactive',
      })
      if (requestId !== tokenRequestId.current) return false
      // Cancelled (book switch, profile switch, editor close): leave whatever is
      // on screen alone and report "not concluded" so a later pass retries.
      if (outcome.aborted) return false
      const exact = outcome.count != null
      const value = exact ? outcome.count as number : estimateTokens(targetContent)
      setTokenCount(value)
      setTokenCountApprox(!exact)
      // No-ops unless `exact` — see the gate at the top of `persistTokenCount`.
      if (persist) persistTokenCount(value, !exact, model, targetContent.length)
      return true
    } finally {
      if (requestId === tokenRequestId.current) setTokenCounting(false)
    }
  }, [activeProfileId, persistTokenCount, profiles])

  const handleCountTokens = useCallback(() => {
    void resolveTokenCount(content, 'manual')
  }, [content, resolveTokenCount])

  // Automatic counting used to fire 400ms after *every* entry open and write the
  // estimate straight back to the server, which bumped the revision and made a
  // freshly opened entry look like it had just been edited. The mode now decides:
  // `live` recounts while typing, `delayed` counts once per opened entry after
  // the configured delay, `manual` only counts when the button is pressed.
  useEffect(() => {
    if (!content.trim()) {
      tokenRequestId.current += 1
      setTokenCounting(false)
      setTokenCount(null)
      setTokenCountApprox(false)
      return
    }
    if (tokenCountMode === 'manual') return
    if (tokenCountMode === 'delayed' && autoCountedId.current === entry.id) return
    const delay = tokenCountMode === 'delayed' ? Math.max(0, tokenCountDelayMs) : 300
    const timeout = window.setTimeout(() => {
      // Stamped only once the count actually concluded. Stamping up front meant a
      // cancelled request (book switch, profile switch) permanently marked the
      // entry as counted.
      void resolveTokenCount(content, 'auto').then((concluded) => {
        if (concluded) autoCountedId.current = entry.id
      })
    }, delay)
    return () => window.clearTimeout(timeout)
  }, [content, entry.id, resolveTokenCount, tokenCountDelayMs, tokenCountMode])

  /**
   * A fresh open is not typing, so it does not wait for the debounce.
   *
   * `tokenCountDelayMs` exists to stop a count going out for every intermediate
   * state of an edit. Opening an entry has no edit to debounce, so the delay bought
   * nothing there and cost the user the whole of it — a full second, at the value
   * anyone who touched this setting still has stored — before any number appeared.
   * That is the reported symptom.
   *
   * Display-only (`persist: false`): the write still happens on the timer above, so
   * the `revision`-bump cadence is exactly what it was. And it is not an extra
   * request — `LorebookEditorWorkspace`'s prefetch has usually already issued this
   * key, and the shared scheduler joins the in-flight promise rather than
   * dispatching a second time.
   *
   * The predicate is in `lib/tokenPrefetchPlan` because there is no DOM test
   * environment here; inline it would be untestable.
   */
  useEffect(() => {
    if (!shouldCountOpenEntryImmediately({
      mode: tokenCountMode,
      entryId: entry.id,
      content,
      savedContent: entry.content,
      prefetchedEntryId: openCountedId.current,
    })) return
    openCountedId.current = entry.id
    void resolveTokenCount(content, 'auto', { persist: false })
  }, [content, entry.content, entry.id, resolveTokenCount, tokenCountMode])

  const handleContentChange = useCallback(
    (v: string) => {
      setContent(v)
      setTokenCount(null)
      setTokenCountApprox(false)
      // Parks the idle sweep for 500ms so a whole-book pass never competes with
      // typing.
      getTokenCountScheduler().noteUserActivity()
      onUpdate(entry.id, { content: v })
    },
    [entry.id, onUpdate]
  )

  const handleCommentChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setComment(e.target.value)
      onUpdate(entry.id, { comment: e.target.value })
    },
    [entry.id, onUpdate]
  )

  const handleOutletNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = e.target.value
      setOutletName(nextValue)
      onUpdate(entry.id, { outlet_name: nextValue || null })
    },
    [entry.id, onUpdate]
  )

  const handlePrimaryKeysChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPrimaryKeys(e.target.value)
      onUpdate(entry.id, {
        key: e.target.value.split(',').map((k) => k.trim()).filter(Boolean),
      })
    },
    [entry.id, onUpdate]
  )

  const handleSecondaryKeysChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSecondaryKeys(e.target.value)
      onUpdate(entry.id, {
        keysecondary: e.target.value.split(',').map((k) => k.trim()).filter(Boolean),
      })
    },
    [entry.id, onUpdate]
  )

  return (
    <div
      className={clsx(
        styles.entryEditor,
        density === 'compact' && styles.compactEntryEditor,
        fillContent && styles.fillEntryEditor,
      )}
    >
      {/* Identity & Content */}
      <span className={styles.sectionHeading}>{t('sections.identity')}</span>
      <div className={clsx(styles.entryFieldGroup, styles.identityFieldGroup)}>
        <div className={styles.entryField}>
          <label className={styles.fieldLabel}>{t('fields.comment')}</label>
          <input
            type="text"
            className={styles.entryInput}
            value={comment}
            onChange={handleCommentChange}
          />
        </div>
        <div className={styles.entryField}>
          <label className={styles.fieldLabel}>{t('fields.outletName')}</label>
          <input
            type="text"
            className={styles.entryInput}
            value={outletName}
            onChange={handleOutletNameChange}
            placeholder={t('outletPlaceholder')}
          />
        </div>
        <div className={styles.entryField}>
          <label className={styles.fieldLabel}>{t('fields.primaryKeys')}</label>
          <input
            type="text"
            className={styles.entryInput}
            value={primaryKeys}
            onChange={handlePrimaryKeysChange}
          />
        </div>
        <div className={styles.entryField}>
          <label className={styles.fieldLabel}>{t('fields.secondaryKeys')}</label>
          <input
            type="text"
            className={styles.entryInput}
            value={secondaryKeys}
            onChange={handleSecondaryKeysChange}
          />
        </div>
        <div className={clsx(styles.entryField, styles.contentField)}>
          <div className={styles.fieldLabelRow}>
            <label className={styles.fieldLabel}>{t('fields.content')}</label>
            <button
              type="button"
              className={styles.tokenCountBtn}
              onClick={handleCountTokens}
              disabled={tokenCounting || !content.trim()}
              title={t('countTokensTitle')}
            >
              {tokenCounting ? <Spinner size={11} fast /> : <Hash size={11} />}
              {tokenCount != null
                ? <span className={styles.tokenCountValue}>{tokenCountApprox ? '~' : ''}{t('tokenCount', { count: tokenCount.toLocaleString() })}</span>
                : t('countTokens')}
            </button>
          </div>
          <ExpandableTextarea
            className={styles.entryTextarea}
            wrapperClassName={fillContent ? styles.fillTextareaWrapper : undefined}
            value={content}
            onChange={handleContentChange}
            title={comment || t('entryContentTitle')}
            rows={density === 'compact' ? 8 : 4}
          />
        </div>
      </div>

      {/* Injection */}
      <span className={styles.sectionHeading}>{t('sections.injection')}</span>
      <div className={styles.entryFieldGroup}>
        <div className={styles.entryFieldRow}>
          <div className={styles.entryField}>
            <label className={styles.fieldLabel}>{t('fields.position')}</label>
            <select
              className={styles.entrySelect}
              value={entry.position}
              onChange={(e) => onImmediateUpdate(entry.id, { position: Number(e.target.value) })}
            >
              {positionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {entry.position === 4 && (
            <div className={clsx(styles.entryField, styles.entryFieldSmall)}>
              <label className={styles.fieldLabel}>{t('fields.depth')}</label>
              <NumberStepper
                value={entry.depth}
                min={0}
                onChange={(v) => onImmediateUpdate(entry.id, { depth: v ?? 0 })}
              />
            </div>
          )}
          <div className={styles.entryField}>
            <label className={styles.fieldLabel}>{t('fields.role')}</label>
            <select
              className={styles.entrySelect}
              value={entry.role || 'system'}
              onChange={(e) => onImmediateUpdate(entry.id, { role: e.target.value })}
            >
              {roleOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className={clsx(styles.entryField, styles.entryFieldSmall)}>
            <label className={styles.fieldLabel}>{t('fields.order')}</label>
            <NumberStepper
              value={entry.order_value}
              onChange={(v) => onImmediateUpdate(entry.id, { order_value: v ?? 0 })}
            />
          </div>
        </div>
      </div>

      {/* Activation */}
      <span className={styles.sectionHeading}>{t('sections.activation')}</span>
      <div className={styles.entryFieldGroup}>
        <div className={styles.toggleRow}>
          <Toggle.Checkbox
            checked={entry.selective}
            onChange={() => onImmediateUpdate(entry.id, { selective: !entry.selective })}
            label={t('toggles.selective')}
          />
          <Toggle.Checkbox
            checked={entry.constant}
            onChange={() => onImmediateUpdate(entry.id, { constant: !entry.constant })}
            label={t('toggles.constant')}
          />
          <Toggle.Checkbox
            checked={entry.disabled}
            onChange={() => onImmediateUpdate(entry.id, { disabled: !entry.disabled })}
            label={t('toggles.disabled')}
          />
          <Toggle.Checkbox
            checked={entry.case_sensitive}
            onChange={() => onImmediateUpdate(entry.id, { case_sensitive: !entry.case_sensitive })}
            label={t('toggles.caseSensitive')}
          />
          <Toggle.Checkbox
            checked={entry.match_whole_words}
            onChange={() => onImmediateUpdate(entry.id, { match_whole_words: !entry.match_whole_words })}
            label={t('toggles.matchWholeWords')}
          />
          <Toggle.Checkbox
            checked={entry.use_regex}
            onChange={() => onImmediateUpdate(entry.id, { use_regex: !entry.use_regex })}
            label={t('toggles.useRegex')}
          />
          <Toggle.Checkbox
            checked={entry.use_probability}
            onChange={() => onImmediateUpdate(entry.id, { use_probability: !entry.use_probability })}
            label={t('toggles.useProbability')}
          />
          <Toggle.Checkbox
            checked={entry.vectorized}
            onChange={() => onImmediateUpdate(entry.id, { vectorized: !entry.vectorized })}
            label={t('toggles.vectorized')}
          />
        </div>
        <div className={styles.vectorStatusRow}>
          <span className={clsx(styles.vectorStatusBadge, vectorStatusClass)}>
            {getVectorIndexStatusLabel(entry.vector_index_status)}
          </span>
          <span className={styles.vectorStatusText}>
            {getVectorIndexStatusDescription(entry)}
          </span>
        </div>
        <div className={styles.entryFieldRow}>
          <div className={clsx(styles.entryField, styles.entryFieldSmall)}>
            <label className={styles.fieldLabel}>{t('fields.probability')}</label>
            <NumberStepper
              value={entry.probability}
              min={0}
              max={100}
              onChange={(v) => onImmediateUpdate(entry.id, { probability: v ?? 0 })}
            />
          </div>
          <div className={clsx(styles.entryField, styles.entryFieldSmall)}>
            <label className={styles.fieldLabel}>{t('fields.scanDepth')}</label>
            <NumberStepper
              value={entry.scan_depth}
              min={0}
              allowEmpty
              onChange={(v) => onImmediateUpdate(entry.id, { scan_depth: v })}
            />
          </div>
          {entry.selective && (
            <div className={styles.entryField}>
              <label className={styles.fieldLabel}>{t('fields.selectiveLogic')}</label>
              <select
                className={styles.entrySelect}
                value={entry.selective_logic}
                onChange={(e) => onImmediateUpdate(entry.id, { selective_logic: Number(e.target.value) })}
              >
                {selectiveLogicOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Timing (collapsible) */}
      <button
        type="button"
        className={styles.groupToggle}
        onClick={() => setTimingOpen((o) => !o)}
      >
        <ChevronRight
          size={12}
          className={clsx(styles.groupToggleIcon, timingOpen && styles.groupToggleOpen)}
        />
        {t('sections.timing')}
      </button>
      {timingOpen && (
        <div className={styles.entryFieldGroup}>
          <div className={styles.entryFieldRow}>
            <div className={clsx(styles.entryField, styles.entryFieldSmall)}>
              <label className={styles.fieldLabel}>{t('fields.priority')}</label>
              <NumberStepper
                value={entry.priority}
                onChange={(v) => onImmediateUpdate(entry.id, { priority: v ?? 0 })}
              />
            </div>
            <div className={clsx(styles.entryField, styles.entryFieldSmall)}>
              <label className={styles.fieldLabel}>{t('fields.sticky')}</label>
              <NumberStepper
                value={entry.sticky}
                min={0}
                onChange={(v) => onImmediateUpdate(entry.id, { sticky: v ?? 0 })}
              />
            </div>
            <div className={clsx(styles.entryField, styles.entryFieldSmall)}>
              <label className={styles.fieldLabel}>{t('fields.cooldown')}</label>
              <NumberStepper
                value={entry.cooldown}
                min={0}
                onChange={(v) => onImmediateUpdate(entry.id, { cooldown: v ?? 0 })}
              />
            </div>
            <div className={clsx(styles.entryField, styles.entryFieldSmall)}>
              <label className={styles.fieldLabel}>{t('fields.delay')}</label>
              <NumberStepper
                value={entry.delay}
                min={0}
                onChange={(v) => onImmediateUpdate(entry.id, { delay: v ?? 0 })}
              />
            </div>
          </div>
        </div>
      )}

      {/* Recursion (collapsible) */}
      <button
        type="button"
        className={styles.groupToggle}
        onClick={() => setRecursionOpen((o) => !o)}
      >
        <ChevronRight
          size={12}
          className={clsx(styles.groupToggleIcon, recursionOpen && styles.groupToggleOpen)}
        />
        {t('sections.recursion')}{recursionInvalidated ? t('sections.recursionInactiveSuffix') : ''}
      </button>
      {recursionOpen && (
        <div className={styles.entryFieldGroup}>
          {recursionInvalidated && (
            <div className={styles.inactiveNote}>
              {t('recursionInactiveNote')}
            </div>
          )}
          <div className={styles.toggleRow}>
            <Toggle.Checkbox
              checked={entry.prevent_recursion}
              onChange={() => onImmediateUpdate(entry.id, { prevent_recursion: !entry.prevent_recursion })}
              label={t('toggles.preventRecursion')}
              disabled={recursionInvalidated}
            />
            <Toggle.Checkbox
              checked={entry.exclude_recursion}
              onChange={() => onImmediateUpdate(entry.id, { exclude_recursion: !entry.exclude_recursion })}
              label={t('toggles.excludeRecursion')}
              disabled={recursionInvalidated}
            />
            <Toggle.Checkbox
              checked={entry.delay_until_recursion}
              onChange={() => onImmediateUpdate(entry.id, { delay_until_recursion: !entry.delay_until_recursion })}
              label={t('toggles.delayUntilRecursion')}
              disabled={recursionInvalidated}
            />
          </div>
        </div>
      )}

      {/* Group (collapsible) */}
      <button
        type="button"
        className={styles.groupToggle}
        onClick={() => setGroupOpen((o) => !o)}
      >
        <ChevronRight
          size={12}
          className={clsx(styles.groupToggleIcon, groupOpen && styles.groupToggleOpen)}
        />
        {t('sections.group')}
      </button>
      {groupOpen && (
        <div className={styles.entryFieldGroup}>
          <div className={styles.entryFieldRow}>
            <div className={styles.entryField}>
              <label className={styles.fieldLabel}>{t('fields.groupName')}</label>
              <input
                type="text"
                className={styles.entryInput}
                value={entry.group_name}
                onChange={(e) => onUpdate(entry.id, { group_name: e.target.value })}
              />
            </div>
            <div className={clsx(styles.entryField, styles.entryFieldSmall)}>
              <label className={styles.fieldLabel}>{t('fields.weight')}</label>
              <NumberStepper
                value={entry.group_weight}
                onChange={(v) => onImmediateUpdate(entry.id, { group_weight: v ?? 0 })}
              />
            </div>
          </div>
          <Toggle.Checkbox
            checked={entry.group_override}
            onChange={() => onImmediateUpdate(entry.id, { group_override: !entry.group_override })}
            label={t('toggles.groupOverride')}
          />
        </div>
      )}

      {/* Metadata (collapsible) */}
      <button
        type="button"
        className={styles.groupToggle}
        onClick={() => setMetadataOpen((o) => !o)}
      >
        <ChevronRight
          size={12}
          className={clsx(styles.groupToggleIcon, metadataOpen && styles.groupToggleOpen)}
        />
        {t('sections.metadata')}
      </button>
      {metadataOpen && (
        <div className={styles.entryFieldGroup}>
          <div className={styles.entryField}>
            <label className={styles.fieldLabel}>{t('fields.uid')}</label>
            <span className={styles.readOnlyValue}>{entry.uid}</span>
          </div>
          <div className={styles.entryField}>
            <label className={styles.fieldLabel}>{t('fields.automationId')}</label>
            <input
              type="text"
              className={styles.entryInput}
              value={entry.automation_id || ''}
              onChange={(e) => onUpdate(entry.id, { automation_id: e.target.value || null })}
            />
          </div>
        </div>
      )}
    </div>
  )
}
