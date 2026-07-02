import { describe, expect, it } from 'vitest';
import { createChannelId } from './channels';

describe('createChannelId', () => {
  it('creates lowercase dash slugs from spaces, punctuation, and casing', () => {
    expect(createChannelId('  Team Updates!!!  ')).toBe('team-updates');
    expect(createChannelId('Managers & L2 Leads')).toBe('managers-l2-leads');
    expect(createChannelId('Admin/Ops Chat')).toBe('adminops-chat');
  });

  it('collapses duplicate dashes and falls back for empty slugs', () => {
    expect(createChannelId('Field -- Training')).toBe('field-training');
    expect(createChannelId('!!!')).toBe('channel');
  });

  it('appends a numeric suffix to avoid existing ids', () => {
    expect(createChannelId('Team Updates', ['team-updates', 'team-updates-2'])).toBe('team-updates-3');
  });
});
