import { UserRole } from './auth';

export type ResourceType = 'video' | 'document' | 'link' | 'quiz';
export type TrainingCategory = 'att' | 'tfiber' | 'verizon_frontier' | 'xfinity' | 'directv';

// Keep ResourceCategory as alias for backward compatibility
export type ResourceCategory = TrainingCategory;

export interface TrainingResource {
  id: string;
  title: string;
  description: string;
  type: ResourceType;
  category: ResourceCategory;
  url: string;
  thumbnailUrl?: string;
  duration?: number; // For videos, in minutes

  // Uploaded-file fields (University content). Absent on legacy link resources.
  storagePath?: string; // e.g. training/{uploadId}/{filename}
  fileName?: string;
  mimeType?: string;
  fileSize?: number;

  requiredRoles: UserRole[]; // Empty means all roles can access
  isRequired: boolean; // Required for onboarding

  viewCount: number;

  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  isPublished: boolean;
  order: number;
}

export interface UserProgress {
  id: string;
  userId: string;
  resourceId: string;
  completed: boolean;
  completedAt?: Date;
  progress: number; // 0-100 percentage
  lastAccessedAt: Date;
}

export const ResourceTypeConfig: Record<ResourceType, { name: string; icon: string }> = {
  video: { name: 'Video', icon: '🎥' },
  document: { name: 'Document', icon: '📄' },
  link: { name: 'External Link', icon: '🔗' },
  quiz: { name: 'Quiz', icon: '📝' },
};

export const ResourceCategoryConfig: Record<ResourceCategory, { name: string; description: string }> = {
  att: { name: 'AT&T', description: 'AT&T training and resources' },
  tfiber: { name: 'T-Fiber', description: 'T-Fiber training and resources' },
  verizon_frontier: { name: 'Verizon/Frontier', description: 'Verizon and Frontier training and resources' },
  xfinity: { name: 'Xfinity', description: 'Xfinity training and resources' },
  directv: { name: 'DirecTV', description: 'DirecTV training and resources' },
};

// Arrays for forms and filters
export const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: 'video', label: 'Video' },
  { value: 'document', label: 'Document' },
  { value: 'link', label: 'External Link' },
  { value: 'quiz', label: 'Quiz' },
];

export const TRAINING_CATEGORIES: { value: TrainingCategory; label: string }[] = [
  { value: 'att', label: 'AT&T' },
  { value: 'tfiber', label: 'T-Fiber' },
  { value: 'verizon_frontier', label: 'Verizon/Frontier' },
  { value: 'xfinity', label: 'Xfinity' },
  { value: 'directv', label: 'DirecTV' },
];
