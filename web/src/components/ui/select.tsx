import { ChevronDown } from 'lucide-react';
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    const widthClass =
      className
        ?.split(' ')
        .filter((c) => c.startsWith('w-') || c.startsWith('max-w-') || c.startsWith('min-w-'))
        .join(' ') || (className?.includes('w-auto') ? 'w-auto' : 'w-full');

    return (
      <div className={cn('relative min-w-0', widthClass)}>
        <select
          ref={ref}
          className={cn(
            'flex h-9 w-full appearance-none rounded-md border border-input bg-card px-3 py-1 pr-8 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-foreground',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
      </div>
    );
  },
);
Select.displayName = 'Select';

export { Select };