import { ReactNode } from 'react';

type PageContainerProps = {
  children: ReactNode;
  className?: string;
};

export default function PageContainer({ children, className = '' }: PageContainerProps) {
  return <div className={`w-full px-6 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 ${className}`}>{children}</div>;
}
