export default function ProgressBar({ current, total, correct, wrong }) {
  const safeTotal = Math.max(total, 1);
  const percent = Math.min(100, Math.round((current / safeTotal) * 100));

  return (
    <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
      <div className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-600">
        <span>진도 {current} / {total}</span>
        <span>{percent}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-700">정답 {correct}</div>
        <div className="rounded-2xl bg-rose-50 px-4 py-3 text-rose-700">오답 {wrong}</div>
      </div>
    </section>
  );
}
