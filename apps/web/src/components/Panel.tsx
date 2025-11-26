import { ReactNode } from 'react';

type PanelProps = {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'secondary';
  padding?: 'none' | 'sm' | 'md' | 'lg';
};

const paddingScale: Record<NonNullable<PanelProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export default function Panel({ children, className = '', variant = 'default', padding = 'md' }: PanelProps) {
  const tone = variant === 'secondary' ? 'surface-secondary' : 'surface';
  const paddingClass = paddingScale[padding] ?? paddingScale.md;
  return <div className={`${tone} ${paddingClass} relative overflow-hidden ${className}`.trim()}>{children}</div>;
}
