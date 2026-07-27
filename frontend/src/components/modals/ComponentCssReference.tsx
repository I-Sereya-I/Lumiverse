import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FileCode2 } from 'lucide-react'
import { extractCssClasses, extractCssVariables } from '@/lib/componentRegistryJoin'
import styles from './PropsReference.module.css'

interface ComponentCssReferenceProps {
  componentName: string
  cssContent: string
  /**
   * False when no stylesheet was extracted for this component at all — as
   * opposed to one that was extracted and happens to declare nothing.  The two
   * used to be indistinguishable, so an orphaned registry key rendered the same
   * near-empty pane as a genuinely empty stylesheet.
   */
  hasStylesheet?: boolean
}

export default function ComponentCssReference({
  componentName,
  cssContent,
  hasStylesheet,
}: ComponentCssReferenceProps) {
  const { t } = useTranslation('modals', { keyPrefix: 'componentCssReference' })

  const componentSelector = `[data-component="${componentName}"]`

  const { uniqueClasses, uniqueVars } = useMemo(() => ({
    uniqueClasses: extractCssClasses(cssContent),
    uniqueVars: extractCssVariables(cssContent),
  }), [cssContent])

  const stylesheetFound = hasStylesheet ?? cssContent.trim().length > 0
  const count = uniqueClasses.length + uniqueVars.length

  // The component root is always documented — even with no stylesheet and no
  // props, that selector is the one thing a user can always write against, so
  // this panel never renders empty for a component the picker lists.
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>
          <FileCode2 size={13} />
          {count > 0 ? t('titleWithCount', { count }) : t('title')}
        </span>
      </div>
      <div className={styles.list}>
        <div className={styles.group}>
          <span className={styles.categoryTitle}>{t('componentRoot')}</span>
          <div className={styles.propRow}>
            <div className={styles.propHeader}>
              <span className={styles.propName}>{componentSelector}</span>
            </div>
            <div className={styles.propDesc}>
              {t('scopeHint', { name: componentName })}
            </div>
          </div>
        </div>

        {!stylesheetFound && (
          <div className={styles.emptyNote}>
            {t('noStylesheet', { name: componentName })}
          </div>
        )}

        {stylesheetFound && count === 0 && (
          <div className={styles.emptyNote}>
            {t('empty', { name: componentName })}
          </div>
        )}

        {uniqueVars.length > 0 && (
          <div className={styles.group}>
            <span className={styles.categoryTitle}>{t('variablesToOverride')}</span>
            {uniqueVars.map((varName) => (
              <div key={varName} className={styles.propRow}>
                <div className={styles.propHeader}>
                  <span className={styles.propName}>{varName}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {uniqueClasses.length > 0 && (
          <div className={styles.group}>
            <span className={styles.categoryTitle}>{t('sourceClasses')}</span>
            <div className={styles.propDesc} style={{ marginBottom: 8 }}>
              {t('hashedHint')}
            </div>
            {uniqueClasses.map((className) => (
              <div key={className} className={styles.propRow}>
                <div className={styles.propHeader}>
                  <span className={styles.propName}>.{className}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
