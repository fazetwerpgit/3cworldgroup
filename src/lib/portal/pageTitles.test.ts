import { describe, expect, it } from 'vitest';
import { portalDocumentTitle, portalPageName } from './pageTitles';

describe('portal page titles', () => {
  it('names each tab and drill-down', () => {
    expect(portalPageName('/portal/dashboard')).toBe('Dashboard');
    expect(portalPageName('/portal/sales')).toBe('Sales');
    expect(portalPageName('/portal/sales/new')).toBe('Log sale');
    expect(portalPageName('/portal/sales/abc123')).toBe('Sale');
    expect(portalPageName('/portal/sales/abc123/edit')).toBe('Edit sale');
    expect(portalPageName('/portal/leaderboard/')).toBe('Leaderboard');
    expect(portalPageName('/portal/admin/users/u1')).toBe('Person · Admin');
  });

  it('gives every known page a different title', () => {
    const paths = ['/portal', '/portal/dashboard', '/portal/sales', '/portal/sales/new', '/portal/leaderboard', '/portal/chat', '/portal/learn', '/portal/settings'];
    const titles = paths.map(portalDocumentTitle);
    expect(new Set(titles).size).toBe(paths.length);
    expect(titles[2]).toBe('Sales | 3C World Group');
  });

  it('leaves unknown paths to their own metadata', () => {
    expect(portalDocumentTitle('/portal/nope')).toBeNull();
    expect(portalDocumentTitle(null)).toBeNull();
  });
});
