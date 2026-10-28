import { cn, initials } from '@/lib/utils';

const PALETTE = [
  'bg-violet-500',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-sky-500',
  'bg-fuchsia-500',
  'bg-teal-500',
  'bg-indigo-500',
];

export function Avatar({
  name,
  url,
  size = 'md',
  className,
}: {
  name?: string | null;
  url?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg', xl: 'h-20 w-20 text-2xl' };
  const init = initials(name);
  const hash = (name ?? '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const color = PALETTE[hash % PALETTE.length];

  if (url) {
    return <img src={url} alt={name ?? 'avatar'} className={cn('rounded-full object-cover', sizes[size], className)} />;
  }
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        color,
        sizes[size],
        className,
      )}
    >
      {init}
    </div>
  );
}