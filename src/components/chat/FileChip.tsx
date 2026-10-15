import { FileText } from 'lucide-react';
import { isPdfFile } from '@/components/chat/attachmentUpload';
import { formatFileSize } from '@/lib/chat/media';
import type { ChatAttachment } from '@/types';
import c from './chat.module.css';

/**
 * The file chip to show for a message, or null when it is not a PDF: a stored
 * `file` attachment, or a pending echo whose picked file is a PDF. The url is
 * withheld while the message is still an unreconciled echo (inert, like a
 * pending photo tile).
 */
export function messageFileInfo(message: {
  attachment?: ChatAttachment;
  pendingFile?: File;
  pendingState?: 'sending' | 'failed';
}): { name: string; size?: number; url?: string } | null {
  if (message.attachment?.type === 'file') {
    return {
      name: message.attachment.name || 'document.pdf',
      size: message.attachment.size,
      url: message.pendingState ? undefined : message.attachment.url,
    };
  }
  if (!message.attachment && message.pendingFile && isPdfFile(message.pendingFile)) {
    return { name: message.pendingFile.name || 'document.pdf', size: message.pendingFile.size };
  }
  return null;
}

/**
 * A PDF attachment as a tappable chip in the bubble column: document icon, the
 * file name (ellipsized), and "PDF · 1.2 MB". A delivered file opens in a new
 * tab; a pending echo (no url yet) is inert and shows the upload progress.
 */
export function FileChip({
  name,
  size,
  url,
  isOwn = false,
  uploading = false,
  failed = false,
  progress,
}: {
  name: string;
  size?: number;
  url?: string;
  isOwn?: boolean;
  uploading?: boolean;
  failed?: boolean;
  progress?: number;
}) {
  const sizeLabel = formatFileSize(size);
  const className = [
    c.fileChip,
    isOwn ? c.fileChipOwn : '',
    uploading ? c.fileChipSending : '',
    failed ? c.attachmentFailed : '',
  ]
    .filter(Boolean)
    .join(' ');
  const inner = (
    <>
      <span className={c.fileIcon} aria-hidden="true">
        <FileText size={20} strokeWidth={1.75} />
      </span>
      <span className={c.fileCopy}>
        <span className={c.fileName}>{name}</span>
        <span className={c.fileMeta}>{sizeLabel ? `PDF · ${sizeLabel}` : 'PDF'}</span>
      </span>
      {uploading && typeof progress === 'number' && (
        <span className={c.progress} aria-hidden="true">
          <span style={{ transform: `scaleX(${progress})` }} />
        </span>
      )}
    </>
  );
  if (!url) {
    return (
      <span className={className} data-attachment-type="file" data-own={isOwn ? 'true' : undefined}>
        {inner}
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open PDF ${name}${sizeLabel ? `, ${sizeLabel}` : ''}`}
      className={className}
      data-attachment-type="file"
      data-own={isOwn ? 'true' : undefined}
    >
      {inner}
    </a>
  );
}

export type PdfPreviewInfo = {
  src: string;
  width?: number;
  height?: number;
  name: string;
  size?: number;
  url?: string;
};

/**
 * The first-page preview tile to show for a message, or null (old PDFs and
 * devices that could not render one keep the chip): a stored `file` attachment
 * with a previewUrl, or a pending PDF echo once its local thumbnail is ready.
 * The PDF url is withheld while the message is still an unreconciled echo.
 */
export function messagePdfPreview(message: {
  attachment?: ChatAttachment;
  pendingFile?: File;
  pendingState?: 'sending' | 'failed';
  localPdfPreviewUrl?: string;
  localPreviewWidth?: number;
  localPreviewHeight?: number;
}): PdfPreviewInfo | null {
  const attachment = message.attachment;
  if (attachment?.type === 'file') {
    if (!attachment.previewUrl) return null;
    return {
      src: attachment.previewUrl,
      width: attachment.previewWidth,
      height: attachment.previewHeight,
      name: attachment.name || 'document.pdf',
      size: attachment.size,
      url: message.pendingState ? undefined : attachment.url,
    };
  }
  if (!attachment && message.pendingFile && message.localPdfPreviewUrl && isPdfFile(message.pendingFile)) {
    return {
      src: message.localPdfPreviewUrl,
      width: message.localPreviewWidth,
      height: message.localPreviewHeight,
      name: message.pendingFile.name || 'document.pdf',
      size: message.pendingFile.size,
    };
  }
  return null;
}

/**
 * A PDF with a first-page preview, sized like a photo tile: the page on white,
 * a "PDF" badge, and a name strip along the bottom. A delivered PDF opens in a
 * new tab (never the image lightbox); a pending echo is inert and shows the
 * upload shimmer and progress like a pending photo.
 */
export function PdfPreviewTile({
  src,
  width,
  height,
  name,
  size,
  url,
  isOwn = false,
  eager = false,
  uploading = false,
  failed = false,
  progress,
}: PdfPreviewInfo & {
  isOwn?: boolean;
  eager?: boolean;
  uploading?: boolean;
  failed?: boolean;
  progress?: number;
}) {
  const sizeLabel = formatFileSize(size);
  const className = [c.attachment, c.pdfTile, failed ? c.attachmentFailed : ''].filter(Boolean).join(' ');
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        // The page's pixel size reserves the tile's box before the image loads
        // (no layout shift); CSS scales it into the photo-tile bounds.
        width={width}
        height={height}
      />
      <span className={c.pdfStrip}>
        <span className={c.pdfBadge} aria-hidden="true">
          PDF
        </span>
        <span className={c.pdfStripName}>{name}</span>
        {sizeLabel && <span className={c.pdfStripMeta}>{sizeLabel}</span>}
      </span>
      {uploading && <span className={c.uploading} />}
      {uploading && typeof progress === 'number' && (
        <span className={c.progress} aria-hidden="true">
          <span style={{ transform: `scaleX(${progress})` }} />
        </span>
      )}
    </>
  );
  if (!url) {
    return (
      <span
        className={className}
        data-attachment-type="file"
        data-pdf-preview="true"
        data-own={isOwn ? 'true' : undefined}
      >
        {inner}
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open PDF ${name}${sizeLabel ? `, ${sizeLabel}` : ''}`}
      className={className}
      data-attachment-type="file"
      data-pdf-preview="true"
      data-own={isOwn ? 'true' : undefined}
    >
      {inner}
    </a>
  );
}
