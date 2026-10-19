// Where an uploaded training file lives: training/{uploadId}/{fileName}
// (hooks/useTrainingUpload). Deleting a resource clears its upload folder, so
// a storagePath must name exactly one file inside one upload folder; anything
// looser (say "training/x") would turn the folder into training/ and delete
// every training file.
const TRAINING_STORAGE_PATH = /^training\/[A-Za-z0-9_-]+\/[^/\\]+$/;

export function isValidTrainingStoragePath(path: unknown): path is string {
  if (typeof path !== 'string' || !TRAINING_STORAGE_PATH.test(path)) return false;
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name !== '.' && name !== '..';
}

/** The upload folder of a valid storagePath (training/{uploadId}/), or null. */
export function trainingUploadFolder(path: unknown): string | null {
  return isValidTrainingStoragePath(path) ? path.slice(0, path.lastIndexOf('/') + 1) : null;
}

/** Fields a training resource PUT may change; everything else in the body is ignored. */
export const TRAINING_EDITABLE_FIELDS = [
  'title',
  'description',
  'type',
  'category',
  'url',
  'thumbnailUrl',
  'duration',
  'requiredRoles',
  'isRequired',
  'isPublished',
  'order',
  'storagePath',
  'fileName',
  'mimeType',
  'fileSize',
] as const;
