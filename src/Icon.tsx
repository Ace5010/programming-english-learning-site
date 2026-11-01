type IconName = 'book' | 'today' | 'library' | 'star' | 'check' | 'sound' | 'search' | 'arrow' | 'close' | 'chevron' | 'review' | 'mic' | 'stop' | 'settings' | 'palette' | 'database' | 'download';

export default function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    settings: <><path d="m10 3-.6 2.2-1.6.9-2.2-.6-2 3.5 1.6 1.6v1.8L3.6 14l2 3.5 2.2-.6 1.6.9L10 20h4l.6-2.2 1.6-.9 2.2.6 2-3.5-1.6-1.6v-1.8L20.4 9l-2-3.5-2.2.6-1.6-.9L14 3Z" /><circle cx="12" cy="11.5" r="3" /></>,
    palette: <><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.4-3.4 1.5 1.5 0 0 1 1.1-2.6h1a4 4 0 0 0 4-4 8 8 0 0 0-9-8Z" /><path d="M7.5 9h.01M11 6.5h.01M16 8h.01M6.5 13h.01" /></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
    mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></>,
    stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
    book: <><path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z" /><path d="M12 6v14" /></>,
    today: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 11h16m-12 5 2 2 5-5" /></>,
    library: <><rect x="3" y="4" width="5" height="16" rx="1" /><path d="M11 4v16m3-15 4-1 4 15-4 1-4-15ZM3 8h5" /></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    check: <path d="m5 12 4.5 4.5L19 7" />,
    sound: <><path d="m11 5-5 4H3v6h3l5 4V5Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    chevron: <path d="m8 10 4 4 4-4" />,
    review: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /><path d="M12 7v5l3 2" /></>,
  };
  return <svg className={`icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
