// Server-only sensitive onboarding fields, stored encrypted in userSensitive/{uid}.
export interface SensitiveDoc {
  ssnEncrypted?: string;
  ssnLast4?: string;
  dlNumberEncrypted?: string;
  dlLast4?: string;
  backgroundCheckAuth?: boolean;
  updatedAt: Date;
  updatedBy: string;
}
