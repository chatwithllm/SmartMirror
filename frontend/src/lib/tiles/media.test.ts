import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import FrigateCameraTile from './FrigateCameraTile.svelte';
import ImmichSlideshowTile from './ImmichSlideshowTile.svelte';
import YouTubeTile from './YouTubeTile.svelte';
import PodcastTile from './PodcastTile.svelte';

describe('media tiles', () => {
  it('FrigateCamera renders', () => {
    const { getByTestId } = render(FrigateCameraTile, {
      props: { id: 'cam', props: { camera: 'driveway' } }
    });
    expect(getByTestId('frigate-cam')).toBeInTheDocument();
  });

  it('Immich renders slideshow with demo images', () => {
    const { getByTestId } = render(ImmichSlideshowTile, { props: { id: 'ss' } });
    expect(getByTestId('immich')).toBeInTheDocument();
    expect(getByTestId('immich-photo')).toBeInTheDocument();
  });

  it('YouTube renders iframe when videoId present', () => {
    const { getByTestId } = render(YouTubeTile, {
      props: { id: 'yt', props: { videoId: 'abcdef' } }
    });
    expect(getByTestId('youtube-frame')).toBeInTheDocument();
  });

  it('YouTube empty without videoId', () => {
    const { getByTestId } = render(YouTubeTile, { props: { id: 'yt' } });
    expect(getByTestId('youtube-empty')).toBeInTheDocument();
  });

  it('Podcast renders with play button', () => {
    const { getByTestId } = render(PodcastTile, { props: { id: 'pd' } });
    expect(getByTestId('podcast')).toBeInTheDocument();
    expect(getByTestId('podcast-play')).toBeInTheDocument();
  });
});
