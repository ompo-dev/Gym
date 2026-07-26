type RedirectOptions = {
  path: string;
  initial: boolean;
};

export function redirectSystemPath({ path }: RedirectOptions): string {
  try {
    const url = new URL(path, 'gym://app');
    const target = url.hostname === 'add' ? 'add' : url.pathname.replace(/^\/+/, '');
    if (target !== 'add') return path;
    return url.searchParams.get('domain') === 'workout' ? '/workout' : '/';
  } catch {
    return '/';
  }
}

