import { Button, Modal } from '@/components/ui/compat';
import { useTranslation } from 'react-i18next';

type ConfirmActionDialogProps = {
  show: boolean;
  title: string;
  description: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function ConfirmActionDialog({
  show,
  title,
  description,
  details = [],
  confirmLabel,
  cancelLabel,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmActionDialogProps) {
  const { t } = useTranslation('common');
  return (
    <Modal
      className="confirm-action-dialog"
      show={show}
      centered
      onHide={busy ? undefined : onCancel}
      backdrop={busy ? 'static' : true}
      keyboard={!busy}
    >
      <Modal.Header closeButton={!busy}>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Modal.Description>{description}</Modal.Description>
        {details.length ? (
          <ul>
            {details.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>
          {cancelLabel || t('actions.cancel')}
        </Button>
        <Button className="primary-button danger-button" type="button" disabled={busy} onClick={onConfirm}>
          {busy ? t('processing') : (confirmLabel || t('actions.confirm'))}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default ConfirmActionDialog;
