import Link from 'next/link';
import { ComponentPropsWithRef, ReactNode, forwardRef } from 'react';

type ButtonTone = 'primary' | 'secondary';

type BaseProps = {
  tone?: ButtonTone;
  icon?: ReactNode;
  className?: string;
};

const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

const baseStyles =
  'relative inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out';

const toneStyles: Record<ButtonTone, string> = {
  primary:
    'bg-[color:var(--color-primary)] text-[color:var(--text-on-accent)] shadow-[var(--shadow-soft)] hover:-translate-y-px hover:shadow-[var(--shadow-accent)] focus-visible:[box-shadow:var(--focus-ring)]',
  secondary:
    'border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] text-[color:var(--text-primary)] hover:-translate-y-px hover:border-[color:var(--color-primary)] focus-visible:[box-shadow:var(--focus-ring)]',
};

export const Button = forwardRef<HTMLButtonElement, ComponentPropsWithRef<'button'> & BaseProps>(
  ({ tone = 'secondary', icon, className = '', children, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cx(baseStyles, toneStyles[tone], 'active:translate-y-0', className)}
      {...props}
    >
      {icon}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export const ButtonLink = forwardRef<HTMLAnchorElement, ComponentPropsWithRef<typeof Link> & BaseProps>(
  ({ tone = 'secondary', icon, className = '', children, ...props }, ref) => (
    <Link ref={ref} className={cx(baseStyles, toneStyles[tone], className)} {...props}>
      {icon}
      {children}
    </Link>
  ),
);
ButtonLink.displayName = 'ButtonLink';
