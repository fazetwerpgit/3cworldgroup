import { UserRole } from './auth';

export type ResourceType = 'video' | 'document' | 'link' | 'quiz';
export type TrainingCategory = 'onboarding' | 'product' | 'sales_technique' | 'compliance' | 'general';

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
  onboarding: { name: 'Onboarding', description: 'Get started with 3C World Group' },
  product: { name: 'Product Knowledge', description: 'Learn about our products and services' },
  sales_technique: { name: 'Sales Techniques', description: 'Improve your sales skills' },
  compliance: { name: 'Compliance', description: 'Required compliance training' },
  general: { name: 'General', description: 'General company information' },
};

// Arrays for forms and filters
export const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: 'video', label: 'Video' },
  { value: 'document', label: 'Document' },
  { value: 'link', label: 'External Link' },
  { value: 'quiz', label: 'Quiz' },
];

export const TRAINING_CATEGORIES: { value: TrainingCategory; label: string }[] = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'product', label: 'Product Knowledge' },
  { value: 'sales_technique', label: 'Sales Techniques' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'general', label: 'General' },
];
