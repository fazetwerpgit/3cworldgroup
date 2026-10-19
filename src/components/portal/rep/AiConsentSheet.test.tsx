import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AiConsentSheet } from './AiConsentSheet';

vi.mock('./BodyLayer', () => ({
  BodyLayer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useIsClient: () => true,
}));

const render = (provider: 'deepseek' | 'gemini') =>
  renderToStaticMarkup(<AiConsentSheet provider={provider} onAgreed={() => {}} onClose={() => {}} />);

describe('AiConsentSheet', () => {
  it('names DeepSeek for Ask 3C, says what is sent and that customer details are not', () => {
    const html = render('deepseek');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Ask 3C uses AI from DeepSeek');
    expect(html).toContain('your question');
    expect(html).toContain('No customer names, addresses, phone numbers or emails are sent.');
  });

  it('names Google Gemini for the screenshot scan, and says the sale can still be typed in', () => {
    const html = render('gemini');
    expect(html).toContain('Google Gemini');
    expect(html).toContain('the screenshot you chose');
    expect(html).toContain('You can still type the sale in yourself.');
  });

  it('links the privacy policy and offers Agree and Not now', () => {
    for (const provider of ['deepseek', 'gemini'] as const) {
      const html = render(provider);
      expect(html).toContain('href="/privacy"');
      expect(html).toContain('>Agree<');
      expect(html).toContain('>Not now<');
    }
  });
});
