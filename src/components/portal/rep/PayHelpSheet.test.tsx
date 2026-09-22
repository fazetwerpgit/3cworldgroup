import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PAY_DISPUTE_HREF, PayHelpSheet } from './PayHelpSheet';

vi.mock('./BodyLayer', () => ({
  BodyLayer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useIsClient: () => true,
}));

describe('PayHelpSheet', () => {
  const html = renderToStaticMarkup(<PayHelpSheet onClose={() => {}} />);

  it('is a T-Fiber specific dialog with the four install-week windows', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('How T-Fiber pay works');
    for (const window of ['14th–18th', '21st–25th', '28th–3rd next month', '7th–11th next month']) {
      expect(html).toContain(window);
    }
  });

  it('covers claims, chargebacks and funds timing, and links the escalation form', () => {
    expect(html).toContain('25th of the next month');
    expect(html).toContain('120 days');
    expect(html).toContain('3C receives funds');
    expect(html).toContain(`href="${PAY_DISPUTE_HREF}"`);
  });

  it('keeps the contract thresholds out', () => {
    expect(html).not.toMatch(/85%|5%|terminat/i);
  });
});
