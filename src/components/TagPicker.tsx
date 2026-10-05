import { Icon, AnimateButton} from 'components/ui';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { suggestTags } from '@/services/domains/tag';
import type { TagSummary } from '@/services/contracts';
import TagCreationFlow from '@/features/tags/TagCreationFlow';
import { formatNumber } from '@/i18n/format';
import { resolveLocale } from '@/i18n/resolveLocale';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';

type TagPickerCreateMode = 'add' | 'link' | 'none';
type TagPickerValueMode = 'slug' | 'id';

export type TagPickerSelection = {
  slug: string;
  label: string;
  source: 'existing' | 'new';
  tag?: TagSummary;
};

type TagPickerProps = {
  value: string[];
  onChange: (next: string[]) => void;
  onPick?: (selection: TagPickerSelection) => void;
  disabled?: boolean;
  max?: number;
  placeholder?: string;
  createMode?: TagPickerCreateMode;
  createLink?: (query: string) => string;
  selectedLabels?: Record<string, string>;
  onSelectedLabelsChange?: (next: Record<string, string>) => void;
  ariaLabel?: string;
  valueMode?: TagPickerValueMode;
};

export function splitTagValues(value: string) {
  return value
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinTagValues(values: string[]) {
  return values.join(', ');
}

export function normalizeTagInput(value: string) {
  const normalized = value
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 35);
  return normalized;
}

function tagLabel(tag: TagSummary) {
  return tag.displayName.trim() || tag.name || tag.slug;
}

function tagMeta(tag: TagSummary, relatedLabel: string) {
  const excerpt = typeof tag.usageExcerpt === 'string' ? tag.usageExcerpt.trim() : '';
  if (excerpt) return excerpt;
  return tag.postCount > 0 ? relatedLabel : '';
}

function tagSlugLabel(tag: TagSummary) {
  const slug = tag.slug.trim();
  if (!slug || slug === tagLabel(tag)) return '';
  return slug;
}

function tagParentLabel(tag: TagSummary) {
  const parentTags = Array.isArray(tag.parentTags) ? tag.parentTags : [];
  if (parentTags.length) {
    return parentTags
      .map((parent) => parent.displayName.trim() || parent.slugName)
      .filter(Boolean)
      .join(' / ');
  }
  return '';
}

function tagContext(tag: TagSummary, relatedLabel: string) {
  return tagParentLabel(tag) || tagMeta(tag, relatedLabel);
}

function sameTag(left: string, right: string) {
  return normalizeTagInput(left) === normalizeTagInput(right);
}

export default function TagPicker({
  value,
  onChange,
  onPick,
  disabled = false,
  max = 6,
  placeholder = '',
  createMode = 'add',
  createLink,
  selectedLabels,
  onSelectedLabelsChange,
  ariaLabel,
  valueMode = 'slug',
}: TagPickerProps) {
  const { t, i18n } = useFeatureTranslation('creation');
  const locale = resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<TagSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creationOpen, setCreationOpen] = useState(false);
  const [creationName, setCreationName] = useState('');
  const selected = useMemo(() => {
    const seen = new Set<string>();
    return value
      .map((item) => normalizeTagInput(item))
      .filter((item) => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      })
      .slice(0, max);
  }, [max, value]);
  const normalizedQuery = normalizeTagInput(query);
  const canAddMore = selected.length < max;
  const suggestionValue = (tag: TagSummary) => (
    valueMode === 'id' ? tag.tagId || '' : tag.slug
  );
  const visibleSuggestions = suggestions.filter((item) => {
    const itemValue = suggestionValue(item);
    return itemValue && !selected.some((selectedItem) => sameTag(selectedItem, itemValue));
  });
  const exactSuggestion = suggestions.find((item) =>
    [item.slug, item.name, item.displayName].some((candidate) => sameTag(candidate, query)),
  );

  useEffect(() => {
    const trimmed = query.trim();
    setError('');
    if (!trimmed) {
      setSuggestions([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void suggestTags(trimmed, 6)
        .then((items) => {
          if (!cancelled) setSuggestions(items);
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([]);
            setError(t('tagPicker.searchFailed'));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, t]);

  const updateLabels = (slug: string, label: string) => {
    if (!onSelectedLabelsChange) return;
    onSelectedLabelsChange({
      ...(selectedLabels || {}),
      [slug]: label,
    });
  };

  const addTag = (slug: string, label?: string, tag?: TagSummary) => {
    const rawValue = tag ? suggestionValue(tag) : slug;
    const nextSlug = normalizeTagInput(rawValue);
    if (!nextSlug || !canAddMore || selected.some((item) => sameTag(item, nextSlug))) return;
    onChange([...selected, nextSlug]);
    const nextLabel = label || nextSlug;
    updateLabels(nextSlug, nextLabel);
    onPick?.({
      slug: nextSlug,
      label: nextLabel,
      source: tag ? 'existing' : 'new',
      tag,
    });
    setQuery('');
    setSuggestions([]);
  };

  const removeTag = (slug: string) => {
    onChange(selected.filter((item) => item !== slug));
  };

  const openCreation = () => {
    setCreationName(query.trim());
    setCreationOpen(true);
  };

  return (
    <div className="tag-picker">
      <div className="tag-picker-input-shell">
        {selected.length ? (
          <div className="tag-picker-selected">
            {selected.map((item) => (
              <AnimateButton unstyled
                type="button"
                key={item}
                disabled={disabled}
                onClick={() => removeTag(item)}
              >
                <span>{selectedLabels?.[item] || item}</span>
                <Icon name="x" />
              </AnimateButton>
            ))}
          </div>
        ) : null}
        <input
          value={query}
          disabled={disabled || !canAddMore}
          maxLength={220}
          placeholder={canAddMore ? placeholder : ''}
          aria-label={ariaLabel || t('tagPicker.label')}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ',' && event.key !== '，') return;
            if (!normalizedQuery || !canAddMore) return;
            event.preventDefault();
            if (loading) return;
            if (exactSuggestion) {
              addTag(exactSuggestion.slug, tagLabel(exactSuggestion), exactSuggestion);
              return;
            }
            openCreation();
          }}
        />
      </div>
      {query.trim() ? (
        <div className="tag-picker-suggestions">
          {loading ? <div className="state-strip compact">{t('tagPicker.searching')}</div> : null}
          {!loading && visibleSuggestions.map((item) => (
            <AnimateButton unstyled
              type="button"
              key={item.slug}
              disabled={disabled || !canAddMore}
              onClick={() => addTag(item.slug, tagLabel(item), item)}
            >
              <div className="tag-picker-suggestion-main">
                <small>ID {item.tagId || '-'}</small>
                <strong>{tagLabel(item)}</strong>
                {tagSlugLabel(item) ? <code>{tagSlugLabel(item)}</code> : null}
              </div>
              {tagContext(item, t('tagPicker.related', {
                count: item.postCount,
                displayCount: formatNumber(locale, item.postCount),
              })) ? (
                <span className="tag-picker-suggestion-context">
                  {tagContext(item, t('tagPicker.related', {
                    count: item.postCount,
                    displayCount: formatNumber(locale, item.postCount),
                  }))}
                </span>
              ) : null}
            </AnimateButton>
          ))}
          {!loading && normalizedQuery && createMode === 'add' ? (
            <AnimateButton unstyled
              type="button"
              disabled={disabled || !canAddMore}
              onClick={openCreation}
            >
              <strong>{t('tagPicker.newTag', { tag: query.trim() })}</strong>
            </AnimateButton>
          ) : null}
          {!loading && normalizedQuery && createMode === 'link' && createLink ? (
            <Link to={createLink(query.trim())} target="_blank" rel="noreferrer">
              {t('tagPicker.createTag', { tag: query.trim() })}
            </Link>
          ) : null}
          {error ? <div className="state-strip compact">{error}</div> : null}
        </div>
      ) : null}
      <TagCreationFlow
        open={creationOpen}
        onOpenChange={setCreationOpen}
        invocation={{ source: 'picker', initialName: creationName }}
        onCreated={(tag) => {
          addTag(String(tag.id), tag.displayName);
          setCreationOpen(false);
        }}
      />
    </div>
  );
}
