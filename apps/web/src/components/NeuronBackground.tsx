'use client';
import { useEffect, useRef } from 'react';
import usePRM from '@/hooks/usePrefersReducedMotion';

export default function NeuronBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = usePRM();
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let w = 0;
    let h = 0;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const nodes = Array.from({ length: reduce ? 20 : 55 }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0006,
      vy: (Math.random() - 0.5) * 0.0006,
    }));
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      w = bounds.width;
      h = bounds.height;
      canvas.width = w * DPR;
      canvas.height = h * DPR;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(DPR, DPR);
    };
    const step = () => {
      ctx.clearRect(0, 0, w, h);
      nodes.forEach((n) => {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > 1) n.vx *= -1;
        if (n.y < 0 || n.y > 1) n.vy *= -1;
      });
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = (a.x - b.x) * w;
          const dy = (a.y - b.y) * h;
          const d = Math.hypot(dx, dy);
          if (d < 140) {
            ctx.strokeStyle = `rgba(59,130,246,${0.12 * (1 - d / 140)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x * w, a.y * h);
            ctx.lineTo(b.x * w, b.y * h);
            ctx.stroke();
          }
        }
      }
      nodes.forEach((n) => {
        ctx.fillStyle = 'rgba(99,102,241,0.8)';
        ctx.beginPath();
        ctx.arc(n.x * w, n.y * h, 1.6, 0, Math.PI * 2);
        ctx.fill();
      });
      raf = requestAnimationFrame(step);
    };
    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [reduce]);
  return <canvas ref={canvasRef} className="fixed inset-0 -z-10 opacity-50" aria-hidden />;
}
