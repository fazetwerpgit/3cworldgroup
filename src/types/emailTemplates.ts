// Management email templates. The boss supplies the actual copy - until
// then templates are authored in-app by admin/operations and stored in
// Firestore (emailTemplates collection). Sending is out of scope here:
// templates are copy-paste material for management's own email client.

export type EmailTemplateCategory =
  | 'recruiting'
  | 'onboarding'
  | 'performance'
  | 'general';

export const EmailTemplateCategoryLabels: Record<EmailTemplateCategory, string> = {
  recruiting: 'Recruiting',
  onboarding: 'Onboarding',
  performance: 'Performance',
  general: 'General',
};

export interface EmailTemplate {
  id: string;
  name: string;
  category: EmailTemplateCategory;
  subject: string;
  body: string;
  // Placeholder tokens like {{rep_name}} the sender fills in manually
  createdBy: string;
  createdByName?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Tokens management can drop into subject/body; purely documentation,
// substitution happens in the sender's email client.
export const EMAIL_TEMPLATE_TOKENS = [
  '{{rep_name}}',
  '{{manager_name}}',
  '{{company}}',
  '{{date}}',
] as const;
