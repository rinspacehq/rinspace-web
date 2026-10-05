import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Form, Modal, Spinner } from '@/components/ui/compat';
import Cropper, { type Area, type Point } from 'react-easy-crop';

type ImageCropDialogProps = {
  open: boolean;
  imageUrl: string;
  title: string;
  aspect: number;
  cropShape?: 'rect' | 'round';
  outputWidth: number;
  outputHeight: number;
  outputFileName: string;
  busy?: boolean;
  // Upload failures are reported by the caller (the modal hides the page-level
  // message), so they must be rendered inside the dialog to be visible.
  error?: string;
  onCancel: () => void;
  onConfirm: (file: File) => Promise<void> | void;
};

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Image loading failed')));
    image.src = source;
  });
}

async function createCroppedImageFile(
  imageUrl: string,
  cropArea: Area,
  outputWidth: number,
  outputHeight: number,
  fileName: string,
): Promise<File> {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas context unavailable');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob);
      } else {
        reject(new Error('Cropped image blob unavailable'));
      }
    }, 'image/jpeg', 0.9);
  });

  return new File([blob], fileName.replace(/\.[^.]+$/, '.jpg') || 'profile-image.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

function ImageCropDialog({
  open,
  imageUrl,
  title,
  aspect,
  cropShape = 'rect',
  outputWidth,
  outputHeight,
  outputFileName,
  busy = false,
  error: externalError = '',
  onCancel,
  onConfirm,
}: ImageCropDialogProps) {
  const { t } = useTranslation('common');
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropAreaPixels, setCropAreaPixels] = useState<Area | null>(null);
  const [cropError, setCropError] = useState('');

  useEffect(() => {
    if (!open || !imageUrl) return undefined;
    let cancelled = false;
    loadImage(imageUrl).catch(() => {
      if (!cancelled) setCropError(t('imageCrop.failed'));
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, open, t]);

  const confirmCrop = async () => {
    if (!cropAreaPixels || busy) return;
    setCropError('');
    try {
      const file = await createCroppedImageFile(
        imageUrl,
        cropAreaPixels,
        outputWidth,
        outputHeight,
        outputFileName,
      );
      await onConfirm(file);
    } catch (confirmError) {
      console.error('Image crop failed', confirmError);
      setCropError(t('imageCrop.failed'));
    }
  };

  const displayedError = externalError || cropError;

  return (
    <Modal
      centered
      size="lg"
      show={open}
      onHide={busy ? undefined : onCancel}
      className="image-crop-modal"
      backdrop={busy ? 'static' : true}
      keyboard={!busy}
      preserveLayoutDuringMotion
    >
      <Modal.Header closeButton={!busy}>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="image-crop-dialog-stage">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={cropShape !== 'round'}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, nextAreaPixels) => setCropAreaPixels(nextAreaPixels)}
          />
        </div>
        <div className="image-crop-dialog-controls">
          <Form.Label htmlFor="profile-image-crop-zoom">{t('imageCrop.zoom')}</Form.Label>
          <Form.Range
            id="profile-image-crop-zoom"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            disabled={busy}
            onChange={(event) => setZoom(Number(event.currentTarget.value))}
          />
        </div>
        {displayedError ? (
          <div className="image-crop-dialog-error" role="alert">
            {displayedError}
          </div>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button className="secondary-link" type="button" disabled={busy} onClick={onCancel}>
          {t('actions.cancel')}
        </Button>
        <Button className="primary-button" type="button" disabled={busy || !cropAreaPixels} onClick={confirmCrop}>
          {busy ? (
            <>
              <Spinner animation="border" size="sm" />
              <span>{t('imageCrop.uploading')}</span>
            </>
          ) : (
            t('imageCrop.apply')
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default ImageCropDialog;
