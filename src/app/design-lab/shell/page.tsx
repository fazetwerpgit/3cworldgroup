import { ShellHarness } from './ShellHarness';

// Temporary harness (untracked, never committed): mirrors the portal viewport.
export const viewport = { themeColor: '#070f1c' };

export default function Page() {
  return <ShellHarness />;
}
