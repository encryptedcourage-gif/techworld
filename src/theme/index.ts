/** Minimal WhatsApp/Telegram-inspired dark theme. */
export const theme = {
  colors: {
    bg: '#0B141A',
    surface: '#111B21',
    surfaceAlt: '#182229',
    primary: '#00A884',
    primaryDark: '#008069',
    bubbleOut: '#005C4B',
    bubbleIn: '#202C33',
    text: '#E9EDEF',
    textMuted: '#8696A0',
    border: '#222D34',
    danger: '#F15C6D',
    gold: '#F5C451',
  },
  spacing: (n: number) => n * 8,
  radius: { sm: 8, md: 12, lg: 20, pill: 999 },
} as const;

export type Theme = typeof theme;
