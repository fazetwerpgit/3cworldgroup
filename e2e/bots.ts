// The pool of QA bot accounts used by the E2E suite. Each form is submitted by
// every bot, so we get multiple independent runs per form (not just one).
//
// SECURITY: passwords are NEVER hardcoded here. They are derived from the
// E2E_BOT_SECRET env var (the same secret the setup script uses), so the repo
// only contains the naming pattern — never a real credential.
export const BOT_COUNT = Number(process.env.E2E_BOT_COUNT || 3);

export interface Bot {
  index: number;
  email: string;
  displayName: string;
  // password is a getter so the tests can be DEFINED without the secret (e.g.
  // `playwright test --list`); the secret is only required when a test actually
  // reads the password to log in.
  readonly password: string;
}

export function bot(index: number): Bot {
  return {
    index,
    email: `qa-e2e-${index}@3cworldgroup.test`,
    displayName: `QA E2E Bot ${index}`,
    get password() {
      const secret = process.env.E2E_BOT_SECRET;
      if (!secret) throw new Error('E2E_BOT_SECRET is not set — required to derive QA bot passwords.');
      return `${secret}#${index}`;
    },
  };
}

export const BOTS: Bot[] = Array.from({ length: BOT_COUNT }, (_, i) => bot(i + 1));
