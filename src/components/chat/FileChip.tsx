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
