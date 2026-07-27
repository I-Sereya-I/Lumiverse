import { useRef, useCallback, useEffect, useMemo, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useScrollGate } from '@/hooks/useScrollGate'
import CharacterCard from './CharacterCard'
import type { Character, CharacterSummary } from '@/types/api'
import type { CharacterDisplaySettings } from '@/types/store'
import { getCharacterGridMetrics } from '@/lib/characterDisplaySettings'
import styles from './CharacterGrid.module.css'

interface CharacterGridProps {
  characters: (Character | CharacterSummary)[]
  favorites: string[]
  batchMode: boolean
  batchSelected: string[]
  singleColumn?: boolean
  display: CharacterDisplaySettings
  onOpen: (character: Character | CharacterSummary) => void
  onEdit: (id: string) => void
  onToggleFavorite: (id: string) => void
  onToggleBatch: (id: string) => void
}

export default function CharacterGrid({
  characters,
  favorites,
  batchMode,
  batchSelected,
  singleColumn,
  display,
  onOpen,
  onEdit,
  onToggleFavorite,
  onToggleBatch,
}: CharacterGridProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  useScrollGate(parentRef)
  const [columns, setColumns] = useState(singleColumn ? 1 : 2)
  const metrics = useMemo(() => getCharacterGridMetrics(display), [display])

  // O(1) lookups instead of O(n) includes() per card
  const favSet = useMemo(() => new Set(favorites), [favorites])
  const batchSet = useMemo(() => new Set(batchSelected), [batchSelected])

  // Observe container width to calculate columns
  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth
      if (singleColumn) {
        setColumns(1)
      } else {
        setColumns(Math.max(1, Math.floor((width + metrics.gap) / (metrics.cardMinWidth + metrics.gap))))
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [metrics.cardMinWidth, metrics.gap, singleColumn])

  const rowHeight = metrics.rowHeight

  const rowCount = Math.ceil(characters.length / columns)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 5,
  })

  const getCharacter = useCallback(
    (rowIndex: number, colIndex: number): Character | CharacterSummary | undefined => {
      const index = rowIndex * columns + colIndex
      return characters[index]
    },
    [characters, columns]
  )

  if (characters.length === 0) return null

  return (
    <div ref={parentRef} className={styles.scrollContainer}>
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            className={styles.row}
            style={{
              position: 'absolute',
              top: virtualRow.start,
              left: 0,
              right: 0,
              height: virtualRow.size,
              display: 'grid',
              gridTemplateColumns: singleColumn
                ? 'minmax(0, 1fr)'
                : `repeat(${columns}, minmax(0, ${metrics.cardMinWidth}px))`,
              justifyContent: columns === 1 ? 'stretch' : 'space-between',
              gap: `${metrics.gap}px`,
              padding: `0 ${metrics.gap / 2}px ${metrics.gap}px`,
            }}
          >
            {Array.from({ length: columns }).map((_, colIndex) => {
              const character = getCharacter(virtualRow.index, colIndex)
              if (!character) return <div key={colIndex} />
              return (
                <CharacterCard
                  key={character.id}
                  character={character}
                  isFavorite={favSet.has(character.id)}
                  isSelected={batchSet.has(character.id)}
                  batchMode={batchMode}
                  useLargeTier
                  display={display}
                  onOpen={onOpen}
                  onEdit={onEdit}
                  onToggleFavorite={onToggleFavorite}
                  onToggleBatch={onToggleBatch}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
