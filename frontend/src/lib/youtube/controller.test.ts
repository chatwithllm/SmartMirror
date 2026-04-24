import { describe, it, expect } from 'vitest';
import { parseYouTubeId } from './controller.js';

describe('parseYouTubeId', () => {
  it('accepts bare 11-char ID', () => {
    expect(parseYouTubeId('jfKfPfyJRdk')).toBe('jfKfPfyJRdk');
  });

  it('parses watch?v= URL', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch?v=jfKfPfyJRdk&t=10s')).toBe('jfKfPfyJRdk');
  });

  it('parses youtu.be short link', () => {
    expect(parseYouTubeId('https://youtu.be/jfKfPfyJRdk')).toBe('jfKfPfyJRdk');
  });

  it('parses /shorts/ URL', () => {
    expect(parseYouTubeId('https://www.youtube.com/shorts/jfKfPfyJRdk')).toBe('jfKfPfyJRdk');
  });

  it('parses /live/ URL', () => {
    expect(parseYouTubeId('https://www.youtube.com/live/jfKfPfyJRdk?feature=share')).toBe(
      'jfKfPfyJRdk',
    );
  });

  it('rejects empty + garbage', () => {
    expect(parseYouTubeId('')).toBeNull();
    expect(parseYouTubeId('   ')).toBeNull();
    expect(parseYouTubeId('not-a-url')).toBeNull();
    expect(parseYouTubeId('https://example.com/foo')).toBeNull();
  });
});
