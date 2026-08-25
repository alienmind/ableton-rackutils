/**
 * The rack's left-hand buttons, as SVG.
 *
 * These are the project owner's own components, kept as supplied: they match
 * Live's icons far better than the text glyphs that stood here, and the shapes
 * are the point. Only two things changed - `size` defaults to the 15px this UI
 * draws them at rather than 32, and every colour stays a prop so a button can
 * show its on/off state by swapping `backgroundColor`, which is how Live
 * signals it (orange when on, near-black when off).
 */
export interface IconProps {
  backgroundColor?: string;
  iconColor?: string;
  size?: number;
}

const ON = '#F09B53';
const OFF = '#1A1A1A';
const NEUTRAL = '#888888';
const DARK_ICON = '#242424';

export const ICON_ON = ON;
export const ICON_OFF = OFF;
export const ICON_NEUTRAL = NEUTRAL;

export const ToggleShowMacroKnobs = ({ backgroundColor = ON, iconColor = DARK_ICON, size = 15 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="11" fill={backgroundColor} />
    <path d="M8 17.5A6.5 6.5 0 1 1 16 17.5" stroke={iconColor} strokeWidth="2" strokeLinecap="round" />
    <line x1="12" y1="12" x2="15" y2="8" stroke={iconColor} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const AddMacroKnobs = ({ backgroundColor = OFF, iconColor = '#E0E0E0', size = 15 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="11" fill={backgroundColor} />
    <path d="M12 7V17M7 12H17" stroke={iconColor} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const RemoveMacroKnobs = ({ backgroundColor = OFF, iconColor = '#E0E0E0', size = 15 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="11" fill={backgroundColor} />
    <path d="M7 12H17" stroke={iconColor} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const ToggleShowMacroVariant = ({ backgroundColor = NEUTRAL, iconColor = '#333333', size = 15 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="11" fill={backgroundColor} />
    <path d="M6 9.5H8.5L9.5 7.5H14.5L15.5 9.5H18V16.5H6V9.5Z" fill={iconColor} />
    <circle cx="12" cy="13" r="2.5" fill={backgroundColor} />
    <path d="M12 11.5V14.5M10.5 13H13.5" stroke={iconColor} strokeWidth="1" strokeLinecap="round" />
  </svg>
);

export const ToggleShowRacks = ({ backgroundColor = ON, iconColor = DARK_ICON, size = 15 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="11" fill={backgroundColor} />
    <rect x="6" y="8" width="12" height="8" rx="2" stroke={iconColor} strokeWidth="2" fill="none" />
    <line x1="6" y1="11" x2="18" y2="11" stroke={iconColor} strokeWidth="2" />
  </svg>
);

export const ToggleShowChains = ({ backgroundColor = NEUTRAL, iconColor = DARK_ICON, size = 15 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="11" fill={backgroundColor} />
    <circle cx="7" cy="8.5" r="1" fill={iconColor} />
    <circle cx="7" cy="12" r="1" fill={iconColor} />
    <circle cx="7" cy="15.5" r="1" fill={iconColor} />
    <path d="M10 8.5H17M10 12H17M10 15.5H17" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
