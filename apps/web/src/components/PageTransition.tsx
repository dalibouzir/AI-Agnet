"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type PageTransitionProps = {
  children: React.ReactNode;
};

export default function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    setAnimating(true);
    const timeout = window.setTimeout(() => setAnimating(false), 400);
    return () => window.clearTimeout(timeout);
  }, [pathname]);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-0.5 bg-transparent">
        <motion.span
          key={`loader-${pathname}-${animating}`}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: animating ? 1 : 0 }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
          className="block h-full origin-left bg-[color:var(--accent)]"
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
