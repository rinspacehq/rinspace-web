import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Form, Modal } from '@/components/ui/compat';
import { beginIdentityStepUp, completeIdentityStepUp } from '@/services/phoneAuth';

type StepUpVerificationDialogProps = {
  show: boolean;
  title: string;
  purpose: string;
  target: string;
  busy?: boolean;
  onCancel(): void;
  onVerified(proof: string): Promise<void>;
};

export default function StepUpVerificationDialog({
  show,
  title,
  purpose,
  target,
  busy = false,
  onCancel,
  onVerified,
}: StepUpVerificationDialogProps) {
  const { t } = useTranslation('common');
  const requestKeyRef = useRef('');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [starting, setStarting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!show || !purpose || !target) return;
    const requestKey = `${purpose}:${target}`;
    if (requestKeyRef.current === requestKey) return;
    requestKeyRef.current = requestKey;
    setChallengeId('');
    setCode('');
    setError('');
    setStarting(true);
    void beginIdentityStepUp(purpose, target)
      .then((challenge) => setChallengeId(challenge.challengeId))
      .catch(() => {
        requestKeyRef.current = '';
        setError(t('stepUp.sendFailed'));
      })
      .finally(() => setStarting(false));
  }, [purpose, show, t, target]);

  const close = () => {
    if (busy || verifying) return;
    requestKeyRef.current = '';
    onCancel();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!challengeId || code.length !== 6 || verifying || busy) return;
    setVerifying(true);
    setError('');
    try {
      const proof = await completeIdentityStepUp(purpose, target, challengeId, code);
      await onVerified(proof);
      requestKeyRef.current = '';
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : t('stepUp.verifyFailed'));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Modal show={show} centered onHide={close} backdrop={busy || verifying ? 'static' : true} keyboard={!busy && !verifying}>
      <Modal.Header closeButton={!busy && !verifying}>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={submit}>
        <Modal.Body>
          <Modal.Description>{t('stepUp.description')}</Modal.Description>
          <Form.Group controlId="step-up-code">
            <Form.Label>{t('stepUp.code')}</Form.Label>
            <Form.Control
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              disabled={starting || verifying || busy || !challengeId}
              autoFocus
              onChange={(event) => setCode(event.currentTarget.value.replace(/\D/g, '').slice(0, 6))}
            />
          </Form.Group>
          {starting ? <p className="auth-dialog-status">{t('stepUp.sending')}</p> : null}
          {error ? <p className="auth-dialog-error" role="alert">{error}</p> : null}
        </Modal.Body>
        <Modal.Footer>
          <Button className="secondary-button" type="button" disabled={busy || verifying} onClick={close}>
            {t('actions.cancel')}
          </Button>
          <Button className="primary-button danger-button" type="submit" disabled={busy || verifying || !challengeId || code.length !== 6}>
            {busy || verifying ? t('processing') : t('stepUp.confirm')}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
