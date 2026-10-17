/**
 * A short row of mutually exclusive choices, such as the template body's
 * views or the preview width. Each segment is a toggle button that exposes
 * whether it is the chosen one (`aria-pressed`); the row is named by `label`.
 */
export function Segmented<T extends string>({
  label,
  className,
  options,
  value,
  onChange,
}: {
  label: string;
  /** Extra class on the frame, for a page's own rule (hiding it when it can do nothing). */
  className?: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className={className ? `po-seg ${className}` : "po-seg"} aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
