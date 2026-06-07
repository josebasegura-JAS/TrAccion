import { useEffect, useState } from 'react';

const build = (() => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
})();

export function Footer() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  return (
    <footer className="h-6 border-t border-white/10 px-3 text-[11px] text-slate-400 flex items-center justify-between bg-black/10">
      <span>TrAccion 1.0.{build}</span>
      <span className="text-emerald-400">✓ Guardado {time.toLocaleTimeString('es-ES',{hour12:false})}</span>
    </footer>
  );
}
