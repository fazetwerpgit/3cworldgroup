// The pool of QA bot accounts used by the E2E suite. Each form is submitted by
// every bot, so we get multiple independent runs per form (not just one).
//
// SECURITY: passwords are NEVER hardcoded here. They are derived from the
// E2E_BOT_SECRET env var (the same secret the setup script uses), so the repo
// only contains the naming pattern — never a real credential.
export const BOT_COUNT = Number(process.env.E2E_BOT_COUNT || 3);

const BOT_SECRET = process.env.E2E_BOT_SECRET;

export interface Bot {
  index: number;
  email: string;
  password: string;
  displayName: string;
}

export function bot(index: number): Bot {
  if (!BOT_SECRET) {
    throw new Error('E2E_BOT_SECRET is not set — required to derive QA bot passwords.');
  }
  return {
    index,
    email: `qa-e2e-${index}@3cworldgroup.test`,
    password: `${BOT_SECRET}#${index}`,
    displayName: `QA E2E Bot ${index}`,
  };
}

export const BOTS: Bot[] = Array.from({ length: BOT_COUNT }, (_, i) => bot(i + 1));
