import { ReactNode } from 'react';

type PageContainerProps = {
  children: ReactNode;
  className?: string;
};

export default function PageContainer({ children, className = '' }: PageContainerProps) {
  return <div className={`mx-auto w-[min(1180px,92%)] ${className}`}>{children}</div>;
}
