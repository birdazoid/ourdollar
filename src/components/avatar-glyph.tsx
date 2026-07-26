import Alien from '@/assets/avatars/avatar-alien.svg';
import Bebok from '@/assets/avatars/avatar-bebok.svg';
import Blobbert from '@/assets/avatars/avatar-blobbert.svg';
import Mac from '@/assets/avatars/avatar-mac.svg';
import Saucer from '@/assets/avatars/avatar-saucer.svg';
import Slippy from '@/assets/avatars/avatar-slippy.svg';
import Spike from '@/assets/avatars/avatar-spike.svg';
import StarFace from '@/assets/avatars/avatar-star-face.svg';
import Tentacool from '@/assets/avatars/avatar-tentacool.svg';
import Wooly from '@/assets/avatars/avatar-wooly.svg';
import { ThemedText } from '@/components/themed-text';

export const AVATAR_GLYPHS = {
  alien: Alien,
  bebok: Bebok,
  blobbert: Blobbert,
  mac: Mac,
  saucer: Saucer,
  slippy: Slippy,
  spike: Spike,
  'star-face': StarFace,
  tentacool: Tentacool,
  wooly: Wooly,
} as const;

export type AvatarId = keyof typeof AVATAR_GLYPHS;

/** Renders a known avatar id as its SVG, or falls back to legacy emoji/text values stored on old rows. */
export function AvatarGlyph({ value, size = 28 }: { value: string | null | undefined; size?: number }) {
  const Glyph = value ? AVATAR_GLYPHS[value as AvatarId] : undefined;
  if (Glyph) return <Glyph width={size} height={size} />;
  return <ThemedText type="body">{value ?? '🙂'}</ThemedText>;
}
