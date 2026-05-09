import type { ChannelHandle } from './channel.js';
import type { SectionId } from '$lib/cards/types.js';

const HANDLES = new Map<SectionId, ChannelHandle>();

export function registerSection(id: SectionId, h: ChannelHandle): void {
  HANDLES.set(id, h);
}
export function unregisterSection(id: SectionId): void {
  HANDLES.delete(id);
}
export function sectionHandle(id: SectionId): ChannelHandle | undefined {
  return HANDLES.get(id);
}
