// The glyphs the application needs besides those of the library. Drawn on a
// 24 px grid with the colour of the text around them.
import type { ReactNode } from 'react';

const Glyph = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const EditIcon = () => (
  <Glyph>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
    <path d="M14.5 7.5l3 3" />
  </Glyph>
);

export const TrashIcon = () => (
  <Glyph>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Glyph>
);

export const SignOutIcon = () => (
  <Glyph>
    <path d="M15 12H4M11 8l-4 4 4 4M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
  </Glyph>
);

export const UsersIcon = () => (
  <Glyph>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.5a6 6 0 0 1 3 5.5" />
  </Glyph>
);

export const StarIcon = () => (
  <Glyph>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.500 9.7l5.9-.9z" />
  </Glyph>
);

export const SeatIcon = () => (
  <Glyph>
    <path d="M4 9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4zM14 7v12" />
  </Glyph>
);

export const GlobeIcon = () => (
  <Glyph>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.500 12h17M12 3.500c2.500 2.600 2.500 14.400 0 17M12 3.500c-2.500 2.600-2.500 14.400 0 17" />
  </Glyph>
);

/** The mark of the application. */
export const Logo = () => (
  <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="var(--punica-color-primary)" />
    <path
      d="M10 22V10h6.500a4 4 0 0 1 0 8H10"
      fill="none"
      stroke="var(--punica-color-on-accent)"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
