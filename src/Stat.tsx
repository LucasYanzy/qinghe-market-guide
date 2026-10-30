import type { ReactNode } from "react";
import { useLanguage } from "./i18n";

export default function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="stat-card">
      <div className="stat-label">
        {t(label)}
        <span>{icon}</span>
      </div>
      <strong className="stat-value">{t(value)}</strong>
      <p>{t(note)}</p>
    </div>
  );
}
