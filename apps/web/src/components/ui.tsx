import { STATUS_LABEL, type RequestStatus } from '@screentime/shared';
import type { ComponentProps, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mt-8 mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{children}</h2>;
}

const variants = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500',
  secondary: 'border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  success: 'bg-green-600 text-white hover:bg-green-500',
} as const;

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: keyof typeof variants }) {
  return (
    <button
      {...props}
      className={`inline-flex h-11 items-center justify-center rounded-xl px-5 font-semibold transition disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

export function Input(props: ComponentProps<'input'>) {
  return (
    <input
      {...props}
      className={`h-11 w-full rounded-xl border border-slate-300 bg-white px-3 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 ${props.className ?? ''}`}
    />
  );
}

const pill: Record<RequestStatus, string> = {
  pending: 'border-amber-500 text-amber-600',
  approved: 'border-green-600 text-green-600',
  denied: 'border-red-600 text-red-600',
  expired: 'border-slate-400 text-slate-500',
  cancelled: 'border-slate-400 text-slate-500',
};

export function StatusPill({ status }: { status: RequestStatus }) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${pill[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
