import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        success: 'border-transparent bg-green-100 text-green-700',
        warning: 'border-transparent bg-amber-100 text-amber-700',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
        info: 'border-transparent bg-blue-100 text-blue-700',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
));
Badge.displayName = 'Badge';

export { Badge, badgeVariants };

export function StatusBadge({ status }: { status?: string }) {
  const s = status?.toLowerCase() ?? '';
  const variant = (() => {
    if (['active', 'connected', 'completed', 'answered', 'ready', 'verified', 'success', 'interested', 'converted', 'paid'].includes(s))
      return 'success';
    if (['paused', 'ringing', 'pending', 'new', 'follow up', 'callback requested', 'processing', 'calling'].includes(s)) return 'warning';
    if (['disabled', 'failed', 'suspended', 'invalid', 'dnd', 'no answer', 'busy', 'wrong number', 'not interested', 'offline'].includes(s))
      return 'destructive';
    if (['training', 'scheduled'].includes(s)) return 'info';
    return 'secondary';
  })();

  return (
    <Badge variant={variant as 'success' | 'warning' | 'destructive' | 'info' | 'secondary'}>
      {(status ?? '—').replace(/_/g, ' ')}
    </Badge>
  );
}