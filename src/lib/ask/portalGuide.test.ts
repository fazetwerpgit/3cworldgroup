import { describe, expect, it } from 'vitest';
import { portalNavGroups } from '@/components/portal/CommandPalette';
import { REP_FORMS } from '@/components/portal/rep/repForms';
import { REP_PRIMARY_HREFS, REP_TABS } from '@/components/portal/rep/repNav';
import { EXPEDITE_REASONS, LEADS_REASONS } from '@/lib/forms/formOptions';
import { PORTAL_GUIDE } from './portalGuide';

// Ask 3C's portal guide is hand-written, so it goes stale the day a tab, menu
// item, form or form reason changes. These come from the real config objects:
// a new one fails here until the guide says it.

const missing = (labels: string[]) => labels.filter((label) => !PORTAL_GUIDE.includes(label));

describe('PORTAL_GUIDE', () => {
  it('names every tab in the rep tab bar', () => {
    expect(missing(REP_TABS.map((tab) => tab.short))).toEqual([]);
  });

  it('names every rep menu item that is not already a tab', () => {
    const [repGroup, ...adminGroups] = portalNavGroups;
    expect(missing(repGroup.items.filter((item) => !REP_PRIMARY_HREFS.has(item.href)).map((item) => item.label))).toEqual([]);
    // Owner/admin screens get one line naming them.
    expect(missing(adminGroups.flatMap((group) => group.items.map((item) => item.label)))).toEqual([]);
  });

  it('names every form on the Forms page and every reason a rep can pick', () => {
    expect(missing(REP_FORMS.map((form) => form.title))).toEqual([]);
    expect(missing([...EXPEDITE_REASONS, ...LEADS_REASONS])).toEqual([]);
  });
});
