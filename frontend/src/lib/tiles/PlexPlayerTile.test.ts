import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import PlexPlayerTile from './PlexPlayerTile.svelte';
import PlexNowPlayingTile from './PlexNowPlayingTile.svelte';
import PlexRecentTile from './PlexRecentTile.svelte';

describe('plex tiles', () => {
  it('PlexPlayer renders poster fallback when no ratingKey', () => {
    const { getByTestId } = render(PlexPlayerTile, { props: { id: 'plex' } });
    expect(getByTestId('plex-poster')).toBeInTheDocument();
  });

  it('PlexNowPlaying renders default session', () => {
    const { getByTestId } = render(PlexNowPlayingTile, { props: { id: 'np' } });
    expect(getByTestId('plex-now-playing')).toBeInTheDocument();
  });

  it('PlexRecent renders a carousel', () => {
    const { getByTestId } = render(PlexRecentTile, { props: { id: 'pr' } });
    expect(getByTestId('plex-recent')).toBeInTheDocument();
  });
});
