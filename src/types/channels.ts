export type ChannelType = 'fiber' | 'satellite' | 'security';

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  active: boolean;
  credentialingPath: 'direct' | 'dsi';
}

// Sales channels (partner companies)
export const CHANNELS: Channel[] = [
  { id: 'frontier', name: 'Frontier', type: 'fiber', active: true, credentialingPath: 'dsi' },
  { id: 'att', name: 'AT&T', type: 'fiber', active: true, credentialingPath: 'dsi' },
  { id: 'tfiber', name: 'TFiber (T-Mobile)', type: 'fiber', active: true, credentialingPath: 'dsi' },
  { id: 'brightspeed', name: 'Brightspeed', type: 'fiber', active: true, credentialingPath: 'dsi' },
  { id: 'kinetic', name: 'Kinetic', type: 'fiber', active: true, credentialingPath: 'dsi' },
  { id: 'ripple', name: 'Ripple', type: 'fiber', active: true, credentialingPath: 'dsi' },
  { id: 'xfinity', name: 'Xfinity', type: 'fiber', active: true, credentialingPath: 'direct' },
  { id: 'directv', name: 'DIRECTV', type: 'satellite', active: true, credentialingPath: 'dsi' },
  { id: 'vivint', name: 'Vivint', type: 'security', active: true, credentialingPath: 'dsi' },
];

// Helper to get channel by ID
export function getChannelById(id: string): Channel | undefined {
  return CHANNELS.find(channel => channel.id === id);
}

// Helper to get channels by type
export function getChannelsByType(type: ChannelType): Channel[] {
  return CHANNELS.filter(channel => channel.type === type);
}
