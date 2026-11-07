import { useState } from 'react';
import { useApp } from './context';
import { Field, Modal, ErrorSummary } from './components';
import type { Bottle } from '../shared/model';

export async function imageBlob(file: File): Promise<Blob> {
  if (file.size > 10 * 1024 * 1024)
    throw new Error('Photo size limit is 10 MB');
  if (
    !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name) ||
    ![
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      '',
    ].includes(file.type)
  )
    throw new Error('Allowed formats: JPEG, PNG, HEIC, WebP');
  if (/\.hei[cf]$/i.test(file.name)) {
    const { default: convert } = await import('heic2any');
    const result = await convert({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.85,
    });
    return Array.isArray(result) ? result[0] : result;
  }
  return file;
}
export async function renderPhoto(blob: Blob, rotation: number, crop: number) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    const sw = (img.width * crop) / 100;
    const sh = (img.height * crop) / 100;
    const rotated = rotation % 180 !== 0;
    const scale = Math.min(1, 1200 / Math.max(sw, sh));
    canvas.width = Math.round((rotated ? sh : sw) * scale);
    canvas.height = Math.round((rotated ? sw : sh) * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image processing is unavailable');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(
      img,
      (img.width - sw) / 2,
      (img.height - sh) / 2,
      sw,
      sh,
      (-sw * scale) / 2,
      (-sh * scale) / 2,
      sw * scale,
      sh * scale,
    );
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch (error) {
    throw new Error(
      `Unable to decode photo: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function Photos({
  bottle,
  change,
}: {
  bottle: Bottle;
  change: (photos: Bottle['photos']) => void;
}) {
  const { t } = useApp();
  const [edit, setEdit] = useState<{ blob: Blob; preview: string }>();
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState(100);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => {
    if (edit) URL.revokeObjectURL(edit.preview);
    setEdit(undefined);
  };
  async function upload(file?: File) {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      if (bottle.photos.length >= 4) throw new Error('Maximum 3 extra photos');
      const blob = await imageBlob(file);
      setEdit({ blob, preview: URL.createObjectURL(blob) });
      setRotation(0);
      setCrop(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card photos">
      <h2>{t('Bottle photos')}</h2>
      <p className="muted">
        {t(
          'JPEG, PNG, HEIC, WebP. Maximum 10 MB each; 1 main and 3 extra photos.',
        )}
      </p>
      <ErrorSummary message={error} />
      {bottle.photos.length === 0 && (
        <div className="bottle-placeholder" aria-hidden="true">
          <span>♧</span>
          <p>{t('Add a photo of your bottle')}</p>
        </div>
      )}
      {bottle.photos.map((photo, i) => (
        <div key={i} className="photo-item">
          <img src={photo.src} alt={photo.alt} />
          <Field name={`photo-alt-${i}`} label="Photo description">
            <input
              id={`photo-alt-${i}`}
              value={photo.alt}
              onChange={(e) =>
                change(
                  bottle.photos.map((p, j) =>
                    j === i ? { ...p, alt: e.target.value } : p,
                  ),
                )
              }
            />
          </Field>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('Remove this photo?')))
                change(bottle.photos.filter((_, j) => i !== j));
            }}
          >
            {t('Remove photo')}
          </button>
        </div>
      ))}
      <Field name="upload-photo" label="Upload photo">
        <input
          type="file"
          id="upload-photo"
          disabled={busy}
          accept=".jpg,.jpeg,.png,.webp,.heic,.heif"
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </Field>
      <Field name="camera-photo" label="Take photo">
        <input
          type="file"
          id="camera-photo"
          disabled={busy}
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </Field>
      {edit && (
        <Modal title={t('Crop and rotate photo')} onClose={close}>
          <div className="crop-preview">
            <img
              src={edit.preview}
              alt={t('Photo preview')}
              style={{
                transform: `rotate(${rotation}deg) scale(${100 / crop})`,
              }}
            />
          </div>
          <Field name="crop" label="Central crop percentage">
            <input
              id="crop"
              type="range"
              min="25"
              max="100"
              value={crop}
              onChange={(e) => setCrop(+e.target.value)}
            />
            <output>{crop}%</output>
          </Field>
          <div className="actions">
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
            >
              {t('Rotate 90°')}
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const src = await renderPhoto(edit.blob, rotation, crop);
                  change([
                    ...bottle.photos,
                    {
                      src,
                      alt: [
                        bottle.name || t('Wine bottle'),
                        bottle.type,
                        bottle.vintage,
                      ]
                        .filter(Boolean)
                        .join(', '),
                    },
                  ]);
                  close();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('Save photo')}
            </button>
            <button type="button" onClick={close}>
              {t('Cancel')}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
