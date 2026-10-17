import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { app } from './config';

// Kept out of ./config (which every portal page loads through AuthContext) so
// the Storage SDK ships only with the training pages that use it.
export const storage: FirebaseStorage | null = app ? getStorage(app) : null;
