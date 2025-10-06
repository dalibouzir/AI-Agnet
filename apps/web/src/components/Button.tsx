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
  'relative inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-fast ease-out';

const toneStyles: Record<ButtonTone, string> = {
  primary:
    'bg-[var(--accent)] text-[#0A0E16] shadow-panel hover:-translate-y-px hover:shadow-[0_0_20px_rgba(0,229,255,0.45)] focus-visible:[box-shadow:var(--focus)]',
  secondary:
    'border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] hover:-translate-y-px hover:border-[var(--accent)] focus-visible:[box-shadow:var(--focus)]',
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
