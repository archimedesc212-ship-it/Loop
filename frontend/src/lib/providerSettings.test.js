import { beforeEach, describe, expect, it } from 'vitest';
import { getMusicProviderSettings, saveMusicProviderSettings } from './providerSettings';

describe('music provider settings', () => {
  beforeEach(() => localStorage.clear());

  it('saves the YouTube public key locally and reads it back', () => {
    saveMusicProviderSettings({ youtubeApiKey: '  sample-public-key  ' });
    expect(getMusicProviderSettings()).toEqual({ youtubeApiKey: 'sample-public-key' });
  });

  it('clears the key when an empty value is saved', () => {
    saveMusicProviderSettings({ youtubeApiKey: 'sample-public-key' });
    saveMusicProviderSettings({ youtubeApiKey: '' });
    expect(getMusicProviderSettings()).toEqual({ youtubeApiKey: '' });
  });
});
