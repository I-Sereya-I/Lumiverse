import { memo, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Star, Pencil } from 'lucide-react'
import { getCharacterAvatarThumbUrl, getCharacterAvatarLargeUrl } from '@/lib/avatarUrls'
import { getTagColor } from '@/lib/tagColors'
import LazyImage from '@/components/shared/LazyImage'
import type { Character, CharacterSummary } from '@/types/api'
import type { CharacterDisplaySettings } from '@/types/store'
import styles from './CharacterCard.module.css'
import clsx from 'clsx'

interface CharacterCardProps {
  character: Character | CharacterSummary
  isFavorite: boolean
  isSelected?: boolean
  batchMode?: boolean
  compact?: boolean
  /** Use the large image tier (~700px) instead of the small tier (~300px) */
  useLargeTier?: boolean
  display?: CharacterDisplaySettings
  onOpen: (character: Character | CharacterSummary) => void
  onEdit?: (id: string) => void
  onToggleFavorite: (id: string) => void
  onToggleBatch?: (id: string) => void
}

export default memo(function CharacterCard({
  character,
  isFavorite,
  isSelected,
  batchMode,
  compact,
  useLargeTier,
  display,
  onOpen,
  onEdit,
  onToggleFavorite,
  onToggleBatch,
}: CharacterCardProps) {
  const { t } = useTranslation('panels')
  const avatarUrl = (useLargeTier ? getCharacterAvatarLargeUrl(character) : getCharacterAvatarThumbUrl(character)) ?? ''
  const tagLimit = Math.max((display?.tagRows ?? 1) * 3, 0)
  const tags = character.tags?.slice(0, tagLimit) || []
  const extraTagCount = Math.max((character.tags?.length || 0) - tagLimit, 0)
  const showCreator = !display || display.visibleMetadata.includes('creator')
  const showTags = !display || display.visibleMetadata.includes('tags')

  const handleClick = () => {
    if (batchMode && onToggleBatch) {
      onToggleBatch(character.id)
    } else {
      onOpen(character)
    }
  }

  return (
    <div
      className={clsx(styles.card, compact && styles.compact, isSelected && styles.selected)}
      data-footer-mode={display?.footerMode}
      style={display ? {
        '--character-image-height': `${display.thumbnailHeight}px`,
        '--character-footer-height': `${display.footerMode === 'compact' ? 52 : display.footerMode === 'spacious' ? 92 : 72}px`,
        '--character-tag-rows': display.tagRows,
      } as CSSProperties : undefined}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <div className={styles.imageWrap}>
        <LazyImage
          src={avatarUrl}
          alt={character.name}
          className={styles.coverImg}
          fallback={
            <div className={styles.avatarFallback}>
              {character.name[0]?.toUpperCase()}
            </div>
          }
        />
        {batchMode && (
          <div className={styles.checkbox}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleBatch?.(character.id)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        {!batchMode && onEdit && (
          <button
            type="button"
            className={styles.editBtn}
            onClick={(e) => {
              e.stopPropagation()
              onEdit(character.id)
            }}
            title={t('characterBrowser.editCharacter')}
          >
            <Pencil size={13} />
          </button>
        )}
        {!batchMode && (
          <button
            type="button"
            className={clsx(styles.favBtn, isFavorite && styles.favBtnActive)}
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite(character.id)
            }}
            title={isFavorite ? t('characterBrowser.removeFromFavorites') : t('characterBrowser.addToFavorites')}
          >
            <Star size={14} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
      <div className={styles.info}>
        <span className={styles.name}>{character.name}</span>
        {!compact && showCreator && character.creator && (
          <span className={styles.creator}>{character.creator}</span>
        )}
        {!compact && showTags && tags.length > 0 && (
          <div className={styles.tags}>
            {tags.map((tag) => {
              const color = getTagColor(tag)
              return (
                <span
                  key={tag}
                  className={styles.tag}
                  style={{ background: color.bg, color: color.text, borderColor: color.border }}
                >
                  {tag}
                </span>
              )
            })}
            {extraTagCount > 0 && (
              <span className={styles.tagOverflow}>+{extraTagCount}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
