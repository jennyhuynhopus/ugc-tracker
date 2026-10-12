/** Small stroke icons (24px grid, currentColor). */
import type { Platform } from "@/lib/domain";

type P = { className?: string };
const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const IconGrid = (p: P) => (<svg viewBox="0 0 24 24" {...s} {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>);
export const IconVideo = (p: P) => (<svg viewBox="0 0 24 24" {...s} {...p}><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="m16 10.5 5-3v9l-5-3" /></svg>);
export const IconUsers = (p: P) => (<svg viewBox="0 0 24 24" {...s} {...p}><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 19.5c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" /><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M18 14.6c1.8.7 3 2.4 3.5 4.9" /></svg>);
export const IconDoc = (p: P) => (<svg viewBox="0 0 24 24" {...s} {...p}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></svg>);
export const IconSettings = (p: P) => (<svg viewBox="0 0 24 24" {...s} {...p}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>);
export const IconAt = (p: P) => (<svg viewBox="0 0 24 24" {...s} {...p}><circle cx="12" cy="12" r="4" /><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1" /></svg>);
export const IconPlay = (p: P) => (<svg viewBox="0 0 24 24" {...s} {...p}><path d="M7 4.5v15l12-7.5z" /></svg>);
export const IconHeart = (p: P) => (<svg viewBox="0 0 24 24" {...s} {...p}><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" /></svg>);
export const IconComment = (p: P) => (<svg viewBox="0 0 24 24" {...s} {...p}><path d="M4 12a8 8 0 1 1 3.3 6.5L4 19.5l1-3.4A8 8 0 0 1 4 12z" /></svg>);
export const IconPulse = (p: P) => (<svg viewBox="0 0 24 24" {...s} {...p}><path d="M3 12h4l2.5-6 5 12 2.5-6h4" /></svg>);
export const IconFlame = (p: P) => (<svg viewBox="0 0 24 24" {...s} {...p}><path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.6-5.3 3.6-8.8 2.4 1.3 3.4 3.4 3.4 5.2 1-.7 1.6-1.8 1.7-3 1.8 1.6 2.8 3.9 2.8 6.6 0 3.6-2.6 6.2-5 6.2z" /></svg>);
export const IconAll = (p: P) => (<svg viewBox="0 0 24 24" {...s} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5z" /></svg>);

// Simplified platform glyphs.
export const IconTikTok = (p: P) => (<svg viewBox="0 0 24 24" {...s} {...p}><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 3c.4 2.6 2.2 4.4 5 4.6" /></svg>);
export const IconInstagram = (p: P) => (<svg viewBox="0 0 24 24" {...s} {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r=".6" fill="currentColor" /></svg>);
export const IconYouTube = (p: P) => (<svg viewBox="0 0 24 24" {...s} {...p}><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="m10.5 9.5 4 2.5-4 2.5z" /></svg>);
export const IconFacebook = (p: P) => (<svg viewBox="0 0 24 24" {...s} {...p}><circle cx="12" cy="12" r="9" /><path d="M13 21v-7.5h2.5M13 21v-9.5a2.5 2.5 0 0 1 2.5-2.5h1M10 13.5h3" /></svg>);

export function PlatformIcon({ platform, className }: { platform: Platform | null; className?: string }) {
  if (platform === "tiktok") return <IconTikTok className={className} />;
  if (platform === "instagram") return <IconInstagram className={className} />;
  if (platform === "youtube") return <IconYouTube className={className} />;
  if (platform === "facebook") return <IconFacebook className={className} />;
  return <IconVideo className={className} />;
}
