// Conjunto de ícones próprio do TOP BURGER OS (SVG, traço 1.75, grade 24).
import type { ReactNode, SVGProps } from "react";

const P = {
  gauge: (<><path d="M4 15a8 8 0 1 1 16 0" /><path d="M12 15l4-5" /><circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" /><path d="M4 19h16" /></>),
  ticket: (<><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z" /><path d="M9 8h6M9 12h6M9 16h3" /></>),
  flame: (<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.4 2.6-5.4 3.6-8.4.4 1.8 1.4 3 2.6 3.6C12 6.6 13.4 4.3 15.6 3c-.3 3 1.9 4.8 2.7 7.2.4 1.2.7 2.5.7 3.7 0 4-3 7.1-7 7.1z" />),
  register: (<><rect x="3" y="11" width="18" height="9" rx="1.5" /><path d="M6 11V7h8v4" /><path d="M14 9h4l1 2" /><path d="M7 15h2M11 15h2M15 15h2" /><path d="M8 4h4" /></>),
  table: (<><path d="M3 9h18" /><path d="M5 9l-1 11M19 9l1 11" /><path d="M8 9v5h8V9" /><path d="M6 5h12l1 4H5z" /></>),
  bike: (<><circle cx="5.5" cy="16.5" r="3.5" /><circle cx="18.5" cy="16.5" r="3.5" /><path d="M5.5 16.5l4-7h5l4 7" /><path d="M9.5 9.5L8 6H5.5" /><path d="M14.5 9.5l1.5-3.5h2.5" /></>),
  "menu-book": (<><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z" /><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3" /><path d="M8 7.5h7M8 11h7M8 14.5h4" /></>),
  burger: (<><path d="M4 10a8 5.5 0 0 1 16 0z" /><path d="M3.5 13.5h17" /><path d="M4.5 16.5h15a0 0 0 0 1 0 0 3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3z" /><path d="M9 7.2h.01M12.5 6.6h.01M15 7.6h.01" /></>),
  folders: (<><path d="M3 7.5V18a1.5 1.5 0 0 0 1.5 1.5h13" /><path d="M7 4h4l2 2h6.5A1.5 1.5 0 0 1 21 7.5V14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 7 14z" /></>),
  combo: (<><path d="M3 12h9l-1 8H4z" /><path d="M5 12V9a2.5 2.5 0 0 1 5 0v3" /><path d="M14 8h6l-1.2 12h-3.6z" /><path d="M17 8l1-4h2" /></>),
  "plus-circle": (<><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>),
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14a6.5 6.5 0 0 1 3.5 6" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  star: (<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />),
  tag: (<><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.4" /></>),
  "chat-star": (<><path d="M4 5h16v11H9l-5 4z" /><path d="M12 7.6l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" /></>),
  megaphone: (<><path d="M3 10v4h3l8 5V5L6 10z" /><path d="M17.5 8.5a5 5 0 0 1 0 7" /><path d="M7 14l1.5 6h2.5L10 14.5" /></>),
  whatsapp: (<><path d="M4 20l1.2-4A8 8 0 1 1 8 19z" /><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .9c-1.2-.5-2.3-1.6-2.8-2.8l.9-1-1-2z" /></>),
  "map-pin": (<><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>),
  map: (<><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14M15 6v14" /></>),
  navigation: (<path d="M12 3l7 18-7-4-7 4z" />),
  boxes: (<><path d="M3 13h8v8H3zM13 13h8v8h-8zM8 3h8v8H8z" /></>),
  truck: (<><path d="M2 6h12v10H2z" /><path d="M14 9h4l3 3.5V16h-7" /><circle cx="6" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>),
  wallet: (<><path d="M3 7a2 2 0 0 1 2-2h12v3" /><path d="M3 7v11a2 2 0 0 0 2 2h15V8H5a2 2 0 0 1-2-1z" /><circle cx="16.5" cy="14" r="1.2" fill="currentColor" stroke="none" /></>),
  receipt: (<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 11.5h6M9 15h4" /></>),
  chart: (<><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-5M12 16V8M16 16v-3M20 16V6" /></>),
  badge: (<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M9 3h6v4H9z" /><circle cx="12" cy="11.5" r="2.2" /><path d="M8 17a4 4 0 0 1 8 0" /></>),
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.2 8.3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.7 4.4V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M4.5 12.5l5 5L19.5 7" />,
  "check-circle": (<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></>),
  "x-circle": (<><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>),
  "chevron-right": <path d="M9 5l7 7-7 7" />,
  "chevron-left": <path d="M15 5l-7 7 7 7" />,
  "chevron-down": <path d="M5 9l7 7 7-7" />,
  "chevron-up": <path d="M5 15l7-7 7 7" />,
  "arrow-right": <path d="M4 12h15M13 6l6 6-6 6" />,
  "arrow-left": <path d="M20 12H5M11 6l-6 6 6 6" />,
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>),
  bell: (<><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>),
  "sound-on": (<><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>),
  "sound-off": (<><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></>),
  printer: (<><path d="M7 8V3h10v5" /><rect x="3" y="8" width="18" height="9" rx="1.5" /><path d="M7 14h10v7H7z" /><path d="M17.5 11h.01" /></>),
  phone: (<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  timer: (<><circle cx="12" cy="13.5" r="7.5" /><path d="M12 9.5v4l2.5 1.5" /><path d="M9.5 3h5M12 3v2.5" /></>),
  store: (<><path d="M4 9.5V20h16V9.5" /><path d="M3 4h18l-1.5 5.5a2.5 2.5 0 0 1-4.8.3 2.6 2.6 0 0 1-5.4 0 2.5 2.5 0 0 1-4.8-.3z" /><path d="M10 20v-5h4v5" /></>),
  logout: (<><path d="M14 4h5v16h-5" /><path d="M10 8l-4 4 4 4M6 12h10" /></>),
  more: (<><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" /></>),
  "more-v": (<><circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" /></>),
  edit: (<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>),
  trash: (<><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></>),
  copy: (<><rect x="8" y="8" width="12" height="12" rx="1.5" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></>),
  eye: (<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>),
  "eye-off": (<><path d="M3 3l18 18" /><path d="M10.6 6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.6M6.4 7.4A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.2-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>),
  image: (<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>),
  upload: (<><path d="M12 15V4M7 9l5-5 5 5" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>),
  download: (<><path d="M12 4v11M7 10l5 5 5-5" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>),
  filter: <path d="M3 5h18l-7 8.5V20l-4-2v-4.5z" />,
  calendar: (<><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>),
  cash: (<><rect x="2.5" y="6" width="19" height="12" rx="1.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v5M18 9.5v5" /></>),
  pix: (<><path d="M12 3l3.6 3.6-3.6 3.6-3.6-3.6z" /><path d="M12 13.8l3.6 3.6L12 21l-3.6-3.6z" /><path d="M3 12l3.6-3.6 3.6 3.6-3.6 3.6zM13.8 12l3.6-3.6L21 12l-3.6 3.6z" /></>),
  card: (<><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 9.5h19M6 15h4" /></>),
  qr: (<><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" /><path d="M14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2h-2z" /></>),
  external: (<><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>),
  alert: (<><path d="M12 4l9.5 16h-19z" /><path d="M12 10v4.5M12 17.5h.01" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8h.01" /></>),
  lock: (<><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>),
  refresh: (<><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16" /><path d="M20 20v-4h-4" /></>),
  maximize: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  minimize: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  grip: (<><circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none" /></>),
  instagram: (<><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17 7h.01" /></>),
  home: (<><path d="M3 11l9-7 9 7" /><path d="M5 9.5V20h14V9.5" /></>),
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  kanban: (<><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="10" rx="1" /><rect x="17" y="4" width="4" height="13" rx="1" /></>),
  package: (<><path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5l9 4.5 9-4.5M12 12v9" /></>),
  percent: (<><path d="M19 5L5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>),
  gift: (<><rect x="3.5" y="8" width="17" height="4" rx="1" /><path d="M5 12v8h14v-8M12 8v12" /><path d="M12 8C10 4 6.5 4.5 7.5 7c.4 1 4.5 1 4.5 1s4.1 0 4.5-1c1-2.5-2.5-3-4.5 1" /></>),
  link: (<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
  bag: (<><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>),
  send: (<><path d="M21 3L10 14" /><path d="M21 3l-7 18-4-7-7-4z" /></>),
  crown: (<><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" /></>),
  building: (<><path d="M4 21V5l8-2v18M12 7h8v14" /><path d="M7.5 8h1M7.5 12h1M7.5 16h1M15.5 11h1M15.5 15h1" /><path d="M2.5 21h19" /></>),
  power: (<><path d="M12 3v8" /><path d="M6.4 7a8 8 0 1 0 11.2 0" /></>),
  layers: (<><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>),
  play: <path d="M7 4.5v15l12-7.5z" />,
  history: (<><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3 3.5V8h4.5" /><path d="M12 7.5V12l3 2" /></>),
  sparkle: (<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />),
  keyboard: (<><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M8 14h8" /></>),
  command: (<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" /></>),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  utensils: (<><path d="M6 3v8a2 2 0 0 0 2 2v8M10 3v8a2 2 0 0 1-2 2M8 3v6" /><path d="M17 21V3c-2 1-3 4-3 8h3" /></>),
  cart: (<><path d="M3 4h2.5l2.2 11h11l2-8H6.5" /><circle cx="9" cy="19.5" r="1.4" /><circle cx="17" cy="19.5" r="1.4" /></>),
  scale: (<><path d="M12 4v16M6 20h12" /><path d="M5 8h14" /><path d="M5 8l-2.5 6a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0z" /></>),
  "arrow-up-right": <path d="M7 17L17 7M8 7h9v9" />,
  "trending-up": (<><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>),
  "trending-down": (<><path d="M3 7l6 6 4-4 8 8" /><path d="M15 17h6v-6" /></>),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, strokeWidth = 1.75, className, ...rest }: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {P[name]}
    </svg>
  );
}
