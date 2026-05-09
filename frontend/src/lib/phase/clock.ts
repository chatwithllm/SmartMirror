export type Phase = 'pratah' | 'madhyahna' | 'sandhya' | 'ratri';

export function phaseAt(d: Date): Phase {
  const h = d.getHours();
  if (h < 5) return 'ratri';
  if (h < 11) return 'pratah';
  if (h < 17) return 'madhyahna';
  if (h < 22) return 'sandhya';
  return 'ratri';
}
