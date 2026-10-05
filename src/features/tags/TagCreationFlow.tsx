import { AnimateButton, Dialog, DialogContent, Icon } from 'components/ui';
import { useEffect, useMemo, useRef, useState } from 'react';

import TagPicker from '@/components/TagPicker';
import { formatNumber } from '@/i18n/format';
import { resolveLocale } from '@/i18n/resolveLocale';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import {
  compareCanonicalTags,
  createCanonicalTag,
  loadTagCreationOperation,
  retryTagCreationOperation,
  type CanonicalTag,
} from '@/services/tagV2';

export type TagCreationInvocation = {
  initialName?: string;
  source: 'picker' | 'directory' | 'topbar' | 'reference' | 'admin';
};

type CreationState = 'idle' | 'submitting' | 'pending' | 'activating' | 'active' | 'failed';
type CreationMessage =
  | ''
  | 'created'
  | 'incompleteRetryable'
  | 'progressUnavailable'
  | 'creating'
  | 'pending'
  | 'failed'
  | 'retrying';

export default function TagCreationFlow({
  open,
  onOpenChange,
  invocation,
  onCreated,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  invocation: TagCreationInvocation;
  onCreated?(tag: CanonicalTag): void;
}) {
  const { t, i18n } = useFeatureTranslation('creation');
  const locale = resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  const [name, setName] = useState(invocation.initialName || '');
  const [scope, setScope] = useState('');
  const [parents, setParents] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<CanonicalTag[]>([]);
  const [operationId, setOperationId] = useState('');
  const [created, setCreated] = useState<CanonicalTag | null>(null);
  const [state, setState] = useState<CreationState>('idle');
  const [retryable, setRetryable] = useState(false);
  const [message, setMessage] = useState<CreationMessage>('');
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    if (open) {
      setName(invocation.initialName || '');
      setScope('');
      setParents([]);
      setLabels({});
      setCandidates([]);
      setOperationId('');
      setCreated(null);
      setState('idle');
      setRetryable(false);
      setMessage('');
      idempotencyKey.current = crypto.randomUUID();
    }
  }, [invocation.initialName, invocation.source, open]);

  useEffect(() => {
    const query = name.trim();
    if (!open || !query) {
      setCandidates([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void compareCanonicalTags(query)
        .then((items) => { if (active) setCandidates(items); })
        .catch(() => { if (active) setCandidates([]); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [name, open]);

  // A retryable failure is not final: the durable delivery keeps retrying in
  // the background, so polling has to survive both the failure and the
  // `activating` step that the operation enters once the Control Plane has
  // accepted the command.
  const awaitingOutcome =
    state === 'pending' || state === 'activating' || (state === 'failed' && retryable);
  useEffect(() => {
    if (!open || !operationId || !awaitingOutcome) return undefined;
    let active = true;
    let polling = false;
    const poll = () => {
      if (polling) return;
      polling = true;
      void loadTagCreationOperation(operationId)
        .then((status) => {
          if (!active) return;
          if (status.state === 'active') {
            setState('active');
            setRetryable(false);
            setMessage('created');
            if (created) onCreated?.(created);
          } else if (status.state === 'failed' || status.state === 'reconciliation_required') {
            setRetryable(status.retryable);
            setState('failed');
            setMessage(status.retryable ? 'incompleteRetryable' : 'failed');
          } else {
            setRetryable(status.retryable);
            setState(status.state === 'activating' ? 'activating' : 'pending');
          }
        })
        .catch(() => { if (active) setMessage('progressUnavailable'); })
        .finally(() => { polling = false; });
    };
    poll();
    const timer = window.setInterval(poll, 1200);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [awaitingOutcome, created, onCreated, open, operationId]);

  const parentIds = useMemo(
    () => parents.map(Number).filter((id) => Number.isInteger(id) && id > 0),
    [parents],
  );
  const submit = async () => {
    if (!name.trim() || !scope.trim() || state === 'submitting') return;
    setState('submitting');
    setMessage('creating');
    try {
      const result = await createCanonicalTag({
        displayName: name.trim(),
        usageScope: scope.trim(),
        parentTagIds: parentIds,
        idempotencyKey: idempotencyKey.current,
      });
      setCreated(result.tag);
      setOperationId(result.operationId);
      setRetryable(false);
      setState(result.state === 'active' ? 'active' : 'pending');
      setMessage(result.state === 'active' ? 'created' : 'pending');
      if (result.state === 'active') onCreated?.(result.tag);
    } catch (error) {
      setState('failed');
      setRetryable(false);
      console.error('Tag creation failed', error);
      setMessage('failed');
    }
  };

  const retry = async () => {
    if (!operationId) return;
    setMessage('retrying');
    try {
      const status = await retryTagCreationOperation(operationId);
      if (status.state === 'active') {
        setState('active');
        setRetryable(false);
        setMessage('created');
        if (created) onCreated?.(created);
        return;
      }
      setRetryable(status.retryable);
      setState(status.state === 'activating' ? 'activating' : 'pending');
      setMessage('pending');
    } catch (error) {
      console.error('Tag creation retry failed', error);
      setState('failed');
      setRetryable(true);
      setMessage('incompleteRetryable');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="tag-creation-flow"
        title={t('tagCreation.title')}
      >
        <div className="tag-creation-flow__body">
          <label><span>{t('tagCreation.name')}</span><input autoFocus value={name} maxLength={256} onChange={(event) => setName(event.currentTarget.value)} /></label>
          <label><span>{t('tagCreation.usageContext')}</span><textarea value={scope} maxLength={2000} placeholder={t('tagCreation.usageContextPlaceholder')} onChange={(event) => setScope(event.currentTarget.value)} /></label>
          <div>
            <span>{t('tagCreation.parentTagsOptional')}</span>
            <TagPicker value={parents} onChange={setParents} selectedLabels={labels} onSelectedLabelsChange={setLabels} createMode="none" valueMode="id" ariaLabel={t('tagCreation.searchParentTags')} />
          </div>
          {candidates.length ? <section aria-label={t('tagCreation.sameNameTags')}>
            <strong>{t('tagCreation.sameNameTags')}</strong>
            {candidates.map((tag) => (
              <article key={tag.id}><b>{tag.displayName}</b><code>ID {formatNumber(locale, tag.id)}</code><p>{tag.usageScope}</p><small>{tag.parentTagIds.length ? t('tagCreation.parents', { parents: tag.parentTagIds.map((id) => formatNumber(locale, id)).join(' / ') }) : t('tagCreation.uncategorized')}</small></article>
            ))}
          </section> : null}
          <div className="tag-creation-flow__status" role="status" aria-live="polite">{message ? t(`tagCreation.status.${message}`) : ''}</div>
        </div>
        <footer>
          <AnimateButton unstyled type="button" onClick={() => void submit()} disabled={!name.trim() || !scope.trim() || state === 'submitting' || state === 'pending' || state === 'activating' || (state === 'failed' && retryable && Boolean(operationId))}><Icon name="plus-circle" />{state === 'submitting' ? t('tagCreation.creatingAction') : t('tagCreation.createAction')}</AnimateButton>
          {state === 'failed' && operationId ? <AnimateButton unstyled type="button" onClick={() => void retry()}><Icon name="arrow-clockwise" />{t('tagCreation.retry')}</AnimateButton> : null}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
