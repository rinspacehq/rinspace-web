import { AnimateKanban, AnimatePaintbrush, AnimatePlus, Button, DialogDescription, Field, Icon, Input, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, Tooltip } from 'components/ui';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import TagPicker from '@/components/TagPicker';
import { Modal } from '@/components/ui/compat';
import { formatNumber } from '@/i18n/format';
import { useOptionalLanguage } from '@/i18n/LanguageProvider';
import { resolveLocale } from '@/i18n/resolveLocale';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { addCanonicalTagAlias, loadTagAliases, loadTagGovernanceHistory, loadTagImpact, proposeTagRequires, renameCanonicalTag, suggestTagParents, type CanonicalTagAlias, type TagGovernanceEvent, type TagImpactPreview } from '@/services/tagV2';

type ParentTag = { tagId: string; slugName: string; displayName: string };
type Props = { tagId: number; displayName: string; version: number; parentTags: ParentTag[] };

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const impactKeys: Array<keyof TagImpactPreview> = [
  'descendants',
  'dependencies',
  'dependants',
  'references',
  'backlinks',
  'associations',
  'redirects',
  'pendingParentReviews',
];

type GovernanceStatus = {
  key: 'loadUnavailable' | 'reviewSubmitted' | 'renamed' | 'aliasAdded' | 'proposalSubmitted' | 'versionConflict' | 'requestFailed';
  values?: Record<string, string | number>;
};

export default function TagGovernancePanel({ tagId, displayName, version, parentTags }: Props) {
  const { t, i18n } = useFeatureTranslation('reader');
  const language = useOptionalLanguage();
  const resolvedLocale = language?.resolvedLocale ?? resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<TagImpactPreview | null>(null);
  const [aliases, setAliases] = useState<CanonicalTagAlias[]>([]);
  const [history, setHistory] = useState<TagGovernanceEvent[]>([]);
  const [parents, setParents] = useState(parentTags.map((parent) => parent.tagId));
  const [parentLabels, setParentLabels] = useState<Record<string, string>>(() => Object.fromEntries(parentTags.map((parent) => [parent.tagId, parent.displayName || parent.slugName])));
  const [reason, setReason] = useState('');
  const [rename, setRename] = useState(displayName);
  const [alias, setAlias] = useState('');
  const [requiresObject, setRequiresObject] = useState<string[]>([]);
  const [requiresLabels, setRequiresLabels] = useState<Record<string, string>>({});
  const [requiresContext, setRequiresContext] = useState<string[]>([]);
  const [contextLabels, setContextLabels] = useState<Record<string, string>>({});
  const [supersedesStatement, setSupersedesStatement] = useState('');
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState<GovernanceStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadTagImpact(tagId), loadTagAliases(tagId), loadTagGovernanceHistory(tagId)]).then(([nextImpact, nextAliases, nextHistory]) => {
      if (!cancelled) { setImpact(nextImpact); setAliases(nextAliases); setHistory(nextHistory); }
    }).catch(() => { if (!cancelled) setStatus({ key: 'loadUnavailable' }); });
    return () => { cancelled = true; };
  }, [tagId]);

  const visibleImpact = useMemo(() => impactKeys.flatMap((key) => {
    const value = impact?.[key];
    return typeof value === 'number' && value > 0 ? [{ key, value }] : [];
  }), [impact]);

  const submit = async (event: FormEvent, action: 'parents' | 'rename' | 'alias' | 'requires') => {
    event.preventDefault();
    setBusy(action);
    setStatus(null);
    try {
      if (action === 'parents') {
        await suggestTagParents(tagId, { parentTagIds: parents.map(Number), baseVersion: impact?.version || version, reason: reason.trim(), requestId: requestId() });
        setStatus({ key: 'reviewSubmitted' });
      } else if (action === 'rename') {
        const updated = await renameCanonicalTag(tagId, { displayName: rename.trim(), baseVersion: impact?.version || version, reason: reason.trim(), requestId: requestId() });
        setStatus({ key: 'renamed', values: { name: updated.displayName } });
        setImpact((current) => current ? { ...current, version: updated.version } : current);
      } else if (action === 'alias') {
        const created = await addCanonicalTagAlias(tagId, { displayName: alias.trim(), baseVersion: impact?.version || version, reason: reason.trim(), requestId: requestId() });
        setAliases((current) => [...current, created]);
        setImpact((current) => current ? { ...current, version: created.tagVersion, aliases: current.aliases + 1 } : current);
        setAlias('');
        setStatus({ key: 'aliasAdded' });
      } else {
        const objectTagId = Number(requiresObject[0]);
        const contextTagId = requiresContext[0] ? Number(requiresContext[0]) : undefined;
        const statement = await proposeTagRequires(tagId, { objectTagId, contextTagId, supersedesStatementId: supersedesStatement.trim() || undefined, reason: reason.trim() });
        setStatus({ key: 'proposalSubmitted', values: { id: statement.id } });
        setRequiresObject([]);
        setRequiresLabels({});
        setRequiresContext([]);
        setContextLabels({});
        setSupersedesStatement('');
      }
    } catch (error) {
      console.error('Tag governance request failed', error);
      const message = error instanceof Error ? error.message : '';
      setStatus({ key: message.includes('tag_version_conflict') ? 'versionConflict' : 'requestFailed' });
    } finally {
      setBusy('');
    }
  };

  const reasonField = (
    <Field label={t('tagGovernance.reason')} required>
      {({ inputId, descriptionId }) => <Textarea id={inputId} aria-describedby={descriptionId} value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} placeholder={t('tagGovernance.reasonPlaceholder')} />}
    </Field>
  );

  return (
    <>
      <Tooltip content={t('tagGovernance.maintain')}>
        <Button className="tag-knowledge-icon-action" type="button" variant="ghost" aria-label={t('tagGovernance.maintain')} onClick={() => setOpen(true)}><Icon data-tag-knowledge-icon="maintain" name="pencil-square" size={18} /></Button>
      </Tooltip>
      <Modal show={open} onHide={() => setOpen(false)} dialogClassName="tag-governance-dialog">
        <Modal.Header closeButton={!busy}>
          <Modal.Title>{t('tagGovernance.maintain')}</Modal.Title>
          <DialogDescription className="sr-only">{t('tagGovernance.description')}</DialogDescription>
        </Modal.Header>
        <Modal.Body>
          {status ? <p className="tag-governance-status" role="status">{t(`tagGovernance.status.${status.key}`, status.values)}</p> : null}
          {visibleImpact.length ? <dl className="tag-impact-grid" aria-label={t('tagGovernance.impactLabel')}>
            {visibleImpact.map((item) => <div key={item.key}><dt>{t(`tagGovernance.impact.${item.key}`)}</dt><dd>{formatNumber(resolvedLocale, item.value)}</dd></div>)}
          </dl> : null}
          <Tabs defaultValue="classification" className="tag-governance-tabs">
            <TabsList aria-label={t('tagGovernance.operations')}>
              <TabsTrigger value="classification">{t('tagGovernance.tabs.classification')}</TabsTrigger>
              <TabsTrigger value="identity">{t('tagGovernance.tabs.identity')}</TabsTrigger>
              <TabsTrigger value="requires">{t('tagGovernance.tabs.requires')}</TabsTrigger>
              <TabsTrigger value="history">{t('tagGovernance.tabs.history')}</TabsTrigger>
            </TabsList>
            <TabsContent value="classification">
              <form onSubmit={(event) => void submit(event, 'parents')}>
                <div className="rin-ui-field">
                  <span className="tag-governance-label">{t('tagGovernance.parentTags')}</span>
                  <TagPicker value={parents} onChange={setParents} selectedLabels={parentLabels} onSelectedLabelsChange={setParentLabels} createMode="none" valueMode="id" ariaLabel={t('tagGovernance.searchParentTags')} placeholder={t('tagGovernance.searchTags')} />
                </div>
                {reasonField}
                <footer className="tag-governance-form-actions">
                  <Button type="button" onClick={() => setOpen(false)}>{t('tagGovernance.cancel')}</Button>
                  <Button type="submit" variant="primary" pending={busy === 'parents'} disabled={busy !== '' || !reason.trim()}><AnimateKanban size={17} />{t('tagGovernance.submitReview')}</Button>
                </footer>
              </form>
            </TabsContent>
            <TabsContent value="identity">
              <form onSubmit={(event) => void submit(event, 'rename')}>
                <Field label={t('tagGovernance.name')}>
                  {({ inputId, descriptionId }) => <Input id={inputId} aria-describedby={descriptionId} value={rename} maxLength={256} onChange={(event) => setRename(event.target.value)} />}
                </Field>
                {reasonField}
                <footer className="tag-governance-form-actions">
                  <Button type="button" onClick={() => setOpen(false)}>{t('tagGovernance.cancel')}</Button>
                  <Button type="submit" variant="primary" pending={busy === 'rename'} disabled={busy !== '' || !reason.trim() || !rename.trim()}><AnimatePaintbrush size={17} />{t('tagGovernance.rename')}</Button>
                </footer>
              </form>
              <form className="tag-alias-form" onSubmit={(event) => void submit(event, 'alias')}>
                <Field label={t('tagGovernance.newAlias')}>
                  {({ inputId, descriptionId }) => <Input id={inputId} aria-describedby={descriptionId} value={alias} maxLength={512} onChange={(event) => setAlias(event.target.value)} />}
                </Field>
                <Button type="submit" pending={busy === 'alias'} disabled={busy !== '' || !alias.trim() || !reason.trim()}><AnimatePlus size={17} />{t('tagGovernance.add')}</Button>
              </form>
              {aliases.length ? <ul className="tag-alias-list">{aliases.map((item) => <li key={item.id}>{item.displayName}</li>)}</ul> : null}
            </TabsContent>
            <TabsContent value="requires">
              <form onSubmit={(event) => void submit(event, 'requires')}>
                <div className="rin-ui-field">
                  <span className="tag-governance-label">{t('tagGovernance.prerequisiteRequired')}</span>
                  <TagPicker value={requiresObject} onChange={setRequiresObject} selectedLabels={requiresLabels} onSelectedLabelsChange={setRequiresLabels} createMode="none" valueMode="id" max={1} ariaLabel={t('tagGovernance.searchPrerequisites')} placeholder={t('tagGovernance.searchTags')} />
                </div>
                <div className="rin-ui-field">
                  <span className="tag-governance-label">{t('tagGovernance.contextTag')}</span>
                  <TagPicker value={requiresContext} onChange={setRequiresContext} selectedLabels={contextLabels} onSelectedLabelsChange={setContextLabels} createMode="none" valueMode="id" max={1} ariaLabel={t('tagGovernance.searchContextTags')} placeholder={t('tagGovernance.searchTags')} />
                </div>
                <Field label={t('tagGovernance.supersedesProposal')}>
                  {({ inputId, descriptionId }) => <Input id={inputId} aria-describedby={descriptionId} value={supersedesStatement} onChange={(event) => setSupersedesStatement(event.target.value)} />}
                </Field>
                {reasonField}
                <footer className="tag-governance-form-actions">
                  <Button type="button" onClick={() => setOpen(false)}>{t('tagGovernance.cancel')}</Button>
                  <Button type="submit" variant="primary" pending={busy === 'requires'} disabled={busy !== '' || !reason.trim() || !requiresObject.length}><AnimatePlus size={17} />{t('tagGovernance.submitProposal')}</Button>
                </footer>
              </form>
            </TabsContent>
            <TabsContent value="history">
              <section className="tag-governance-history" aria-labelledby={`tag-governance-history-${tagId}`}>
                <h3 id={`tag-governance-history-${tagId}`} className="sr-only">{t('tagGovernance.history')}</h3>
                {history.length ? <ol>{history.map((event) => <li key={event.id}><strong>{event.eventType}</strong><span>v{formatNumber(resolvedLocale, event.baseVersion)} → v{formatNumber(resolvedLocale, event.newVersion)}</span>{event.reason ? <p>{event.reason}</p> : null}</li>)}</ol> : <p className="tag-knowledge-empty">{t('tagGovernance.noHistory')}</p>}
              </section>
            </TabsContent>
          </Tabs>
        </Modal.Body>
      </Modal>
    </>
  );
}
