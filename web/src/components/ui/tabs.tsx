import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const Tabs = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-wrap gap-1 border-b', className)} {...props} />
));
Tabs.displayName = 'Tabs';

interface TabItemProps extends HTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  count?: number;
}
const TabsTrigger = forwardRef<HTMLButtonElement, TabItemProps>(({ className, active, count, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      'inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none',
      active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
      className,
    )}
    {...props}
  >
    {children}
    {typeof count === 'number' ? (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>
    ) : null}
  </button>
));
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('mt-4', className)} {...props} />
));
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsTrigger, TabsContent };