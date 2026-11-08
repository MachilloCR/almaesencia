type SearchFieldProps = {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  variant?: "public" | "admin";
};

export default function SearchField({ id, label, placeholder, value, onChange, className = "", variant = "public" }: SearchFieldProps) {
  const inputSurface = variant === "admin" ? "admin-field bg-admin-input" : "bg-white";

  return (
    <label className={`block text-xs font-semibold text-text-secondary ${className}`} htmlFor={id}>
      {label}
      <span className="relative mt-2 block">
        <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <input
          className={`min-h-12 w-full rounded-lg border border-border-subtle ${inputSurface} py-2 pl-10 pr-3 text-sm font-normal text-text-primary outline-none placeholder:text-text-secondary/70 focus:border-brand-primary focus:ring-3 focus:ring-brand-primary/12`}
          id={id}
          type="search"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}
