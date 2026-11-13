// TypeScript port of the Evalve Design System components (components/bundle.js).
// Class names and behavior match the design system; styles live in components.css.
// Icons come from lucide-react, as the design system's README says.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Check, CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* Button: one blue `default` (primary) per view. */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "xs" | "sm" | "default" | "lg";
  icon?: LucideIcon;
};
export function Button({ variant = "default", size = "default", icon: IconC, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      className={cx("ev-btn", `ev-btn-${variant}`, `ev-btn-s-${size}`, IconC && "ev-btn-has-icon", className)}
    >
      {IconC ? <IconC size={size === "xs" ? 12 : 16} aria-hidden /> : null}
      {children}
    </button>
  );
}

/* Input: 36px field on surface-white; you supply the label. */
type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };
export function Input({ invalid, className, ...rest }: InputProps) {
  return <input type="text" {...rest} aria-invalid={invalid || undefined} className={cx("ev-input", className)} />;
}

/* Card: flat container, no shadow, no nesting. */
export function Card({ title, description, children, className }: { title?: ReactNode; description?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx("ev-card", className)}>
      {title || description ? (
        <div className="ev-card-header">
          {title ? <div className="ev-card-title">{title}</div> : null}
          {description ? <div className="ev-card-description">{description}</div> : null}
        </div>
      ) : null}
      {children != null ? <div className="ev-card-content">{children}</div> : null}
    </div>
  );
}

/* Alert: tint + AA text recipe. */
type AlertVariant = "default" | "neutral" | "info" | "success" | "warning" | "destructive";
const ALERT_ICON: Record<AlertVariant, LucideIcon> = {
  default: Info, neutral: Info, info: Info, success: CircleCheck, warning: TriangleAlert, destructive: CircleAlert,
};
export function Alert({ variant = "default", title, children }: { variant?: AlertVariant; title?: ReactNode; children?: ReactNode }) {
  const IconC = ALERT_ICON[variant];
  return (
    <div role={variant === "destructive" ? "alert" : "status"} className={cx("ev-alert", `ev-alert-v-${variant}`, "ev-alert-e-light")}>
      <IconC size={16} className="ev-alert-icon" aria-hidden />
      <div className="ev-alert-content">
        {title ? <div className="ev-alert-title">{title}</div> : null}
        {children != null ? <div className="ev-alert-description">{children}</div> : null}
      </div>
    </div>
  );
}

/* Badge: status or metadata pill. `dot` puts a dot in the text color before the label. */
type BadgeVariant = "default" | "destructive" | "success" | "warning" | "info" | "teal" | "neutral" | "archived" | "secondary" | "outline";
export function Badge({ variant = "default", emphasis = "light", radius, mono, dot, children }: { variant?: BadgeVariant; emphasis?: "bold" | "light" | "neutral" | "ghost"; radius?: "full" | "sm"; mono?: boolean; dot?: boolean; children?: ReactNode }) {
  return (
    <span
      className={cx("ev-badge", `ev-badge-v-${variant}`, `ev-badge-e-${emphasis}`, radius === "sm" && "ev-badge-r-sm")}
      style={mono ? { fontFamily: "var(--font-mono)" } : undefined}
    >
      {dot ? <span className="ev-badge-dot" aria-hidden /> : null}
      {children}
    </span>
  );
}

/* StatusLabel: a dot always sits beside a text label, never color alone. */
const STATUS_TONE: Record<string, "success" | "warning" | "destructive" | "teal" | "muted"> = {
  completed: "success", active: "success",
  running: "warning", retrying: "warning", waiting: "warning",
  failed: "destructive", error: "destructive",
  initializing: "teal", provisioning: "teal", resuming: "teal",
};
export function StatusLabel({ status, children, tone: toneOverride }: { status: string; children?: ReactNode; tone?: "success" | "warning" | "destructive" | "teal" | "muted" }) {
  const tone = toneOverride ?? STATUS_TONE[status.toLowerCase()] ?? "muted";
  return (
    <span className="ev-status">
      <span className={cx("ev-dot", `ev-dot-${tone}`)} aria-hidden />
      <span>{children ?? status}</span>
    </span>
  );
}

/* Logo: paths copied from the design system, colored by the brand tokens. */
const LOGO = {
  back: "M0.763785 0.59249C1.71112 -0.260089 3.16999 -0.183466 4.02265 0.763768L10.946 8.45625C11.7359 9.33389 11.7359 10.6661 10.946 11.5438L4.02265 19.2362C3.16999 20.1835 1.71112 20.2601 0.763785 19.4075C-0.18347 18.5549 -0.260095 17.096 0.592503 16.1487L6.12611 10L0.592503 3.85128C-0.260095 2.90397 -0.183471 1.44512 0.763785 0.59249Z",
  front: "M9.22533 0.59249C10.1727 -0.260089 11.6315 -0.183466 12.4842 0.763768L19.4076 8.45625C20.1975 9.33389 20.1975 10.6661 19.4076 11.5438L12.4842 19.2362C11.6315 20.1835 10.1727 20.2601 9.22533 19.4075C8.27807 18.5549 8.20144 17.096 9.05404 16.1487L14.5876 10L9.05404 3.85128C8.20144 2.90397 8.27807 1.44512 9.22533 0.59249Z",
  dot: "M26.5385 15.3846C29.5123 15.3846 31.9231 12.9738 31.9231 10C31.9231 7.02616 29.5123 4.61539 26.5385 4.61539C23.5646 4.61539 21.1538 7.02616 21.1538 10C21.1538 12.9738 23.5646 15.3846 26.5385 15.3846Z",
  wordmark: "M51.9615 12.9692H43.0308C43.0923 13.7692 43.35 14.3808 43.8038 14.8038C44.2577 15.2269 44.8154 15.4385 45.4769 15.4385C46.4615 15.4385 47.1462 15.0231 47.5308 14.1923H51.7308C51.5154 15.0385 51.1269 15.8 50.5654 16.4769C50.0038 17.1538 49.3 17.6846 48.4538 18.0692C47.6077 18.4538 46.6615 18.6462 45.6154 18.6462C44.3538 18.6462 43.2308 18.3769 42.2462 17.8385C41.2615 17.3 40.4923 16.5308 39.9385 15.5308C39.3846 14.5308 39.1077 13.3615 39.1077 12.0231C39.1077 10.6846 39.3808 9.51538 39.9269 8.51538C40.4731 7.51538 41.2385 6.74615 42.2231 6.20769C43.2077 5.66923 44.3385 5.4 45.6154 5.4C46.8615 5.4 47.9692 5.66154 48.9385 6.18461C49.9077 6.70769 50.6654 7.45384 51.2115 8.42307C51.7577 9.3923 52.0308 10.5231 52.0308 11.8154C52.0308 12.1846 52.0077 12.5692 51.9615 12.9692ZM47.9923 10.7769C47.9923 10.1 47.7615 9.56153 47.3 9.16153C46.8385 8.76153 46.2615 8.56153 45.5692 8.56153C44.9077 8.56153 44.35 8.75384 43.8962 9.13846C43.4423 9.52307 43.1615 10.0692 43.0539 10.7769H47.9923ZM59.2077 14.7692L62 5.58461H66.2L61.6308 18.4615H56.7615L52.1923 5.58461H56.4154L59.2077 14.7692ZM72.0615 5.4C72.9692 5.4 73.7654 5.58461 74.45 5.95384C75.1346 6.32307 75.6615 6.80769 76.0308 7.40769V5.58461H79.9769V18.4615H76.0308V16.6385C75.6462 17.2385 75.1115 17.7231 74.4269 18.0923C73.7423 18.4615 72.9462 18.6462 72.0385 18.6462C70.9923 18.6462 70.0385 18.3731 69.1769 17.8269C68.3154 17.2808 67.6346 16.5038 67.1346 15.4962C66.6346 14.4885 66.3846 13.3231 66.3846 12C66.3846 10.6769 66.6346 9.51538 67.1346 8.51538C67.6346 7.51538 68.3154 6.74615 69.1769 6.20769C70.0385 5.66923 71 5.4 72.0615 5.4ZM73.2154 8.83846C72.4308 8.83846 71.7654 9.11923 71.2192 9.68077C70.6731 10.2423 70.4 11.0154 70.4 12C70.4 12.9846 70.6731 13.7654 71.2192 14.3423C71.7654 14.9192 72.4308 15.2077 73.2154 15.2077C74 15.2077 74.6654 14.9231 75.2115 14.3538C75.7577 13.7846 76.0308 13.0077 76.0308 12.0231C76.0308 11.0385 75.7577 10.2615 75.2115 9.6923C74.6654 9.12307 74 8.83846 73.2154 8.83846ZM86.0923 1.38461V18.4615H82.1462V1.38461H86.0923ZM94.0538 14.7692L96.8462 5.58461H101.046L96.4769 18.4615H91.6077L87.0385 5.58461H91.2615L94.0538 14.7692ZM114.085 12.9692H105.154C105.215 13.7692 105.473 14.3808 105.927 14.8038C106.381 15.2269 106.938 15.4385 107.6 15.4385C108.585 15.4385 109.269 15.0231 109.654 14.1923H113.854C113.638 15.0385 113.25 15.8 112.688 16.4769C112.127 17.1538 111.423 17.6846 110.577 18.0692C109.731 18.4538 108.785 18.6462 107.738 18.6462C106.477 18.6462 105.354 18.3769 104.369 17.8385C103.385 17.3 102.615 16.5308 102.062 15.5308C101.508 14.5308 101.231 13.3615 101.231 12.0231C101.231 10.6846 101.504 9.51538 102.05 8.51538C102.596 7.51538 103.362 6.74615 104.346 6.20769C105.331 5.66923 106.462 5.4 107.738 5.4C108.985 5.4 110.092 5.66154 111.062 6.18461C112.031 6.70769 112.788 7.45384 113.335 8.42307C113.881 9.3923 114.154 10.5231 114.154 11.8154C114.154 12.1846 114.131 12.5692 114.085 12.9692ZM110.115 10.7769C110.115 10.1 109.885 9.56153 109.423 9.16153C108.962 8.76153 108.385 8.56153 107.692 8.56153C107.031 8.56153 106.473 8.75384 106.019 9.13846C105.565 9.52307 105.285 10.0692 105.177 10.7769H110.115Z",
};
export function EvalveLogo({ height = 20 }: { height?: number }) {
  return (
    <svg className="ev-logo" height={height} width={(height * 115) / 20} viewBox="0 0 115 20" fill="none" role="img" aria-label="evalve">
      <path className="ev-logo-back" d={LOGO.back} />
      <path className="ev-logo-front" d={LOGO.front} />
      <path className="ev-logo-dot" d={LOGO.dot} />
      <path className="ev-logo-wordmark" d={LOGO.wordmark} />
    </svg>
  );
}

/* Mark alone (no wordmark), and the 48px tile that holds it. */
const MARK = {
  back: "M2.91255 6.86596C3.63094 6.21942 4.73726 6.27753 5.38385 6.99585L10.6341 12.8293C11.2331 13.4949 11.2331 14.5051 10.6341 15.1707L5.38385 21.0041C4.73726 21.7225 3.63094 21.7806 2.91255 21.134C2.19421 20.4874 2.1361 19.3812 2.78266 18.6628L6.97897 14L2.78266 9.33721C2.1361 8.61883 2.19421 7.51254 2.91255 6.86596Z",
  front: "M9.3292 6.86596C10.0476 6.21942 11.1539 6.27753 11.8005 6.99585L17.0507 12.8293C17.6498 13.4949 17.6498 14.5051 17.0507 15.1707L11.8005 21.0041C11.1539 21.7225 10.0476 21.7806 9.3292 21.134C8.61087 20.4874 8.55276 19.3812 9.19932 18.6628L13.3956 14L9.19932 9.33721C8.55276 8.61883 8.61087 7.51254 9.3292 6.86596Z",
  dot: "M22.4583 18.0833C24.7135 18.0833 26.5417 16.2552 26.5417 14C26.5417 11.7448 24.7135 9.91666 22.4583 9.91666C20.2032 9.91666 18.375 11.7448 18.375 14C18.375 16.2552 20.2032 18.0833 22.4583 18.0833Z",
};
export function EvalveMarkIcon({ size = 28 }: { size?: number }) {
  return (
    <svg className="ev-logo" height={size} width={size} viewBox="0 0 28 28" fill="none" role="img" aria-label="evalve">
      <path className="ev-logo-back" d={MARK.back} />
      <path className="ev-logo-front" d={MARK.front} />
      <path className="ev-logo-dot" d={MARK.dot} />
    </svg>
  );
}
export function BrandMarkTile() {
  return (
    <span className="ev-marktile">
      <EvalveMarkIcon size={28} />
    </span>
  );
}

/* Avatar: initials on surface-muted. */
export function Avatar({ initials, size = "default" }: { initials: string; size?: "sm" | "default" | "lg" }) {
  return <span className={cx("ev-avatar", `ev-avatar-s-${size}`, "ev-avatar-circle")}>{initials}</span>;
}

/* Checkbox: 16px, blue fill when checked. */
export function Checkbox({ checked, onCheckedChange, disabled, id, ...aria }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; id?: string; "aria-label"?: string; "aria-describedby"?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      className="ev-checkbox"
      onClick={() => onCheckedChange(!checked)}
      {...aria}
    >
      {checked ? <Check size={12} strokeWidth={3} aria-hidden /> : null}
    </button>
  );
}

/* Switch: on/off toggle for settings. */
export function Switch({ checked, onCheckedChange, id, ...aria }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string; "aria-label"?: string; "aria-labelledby"?: string }) {
  return (
    <button type="button" role="switch" id={id} aria-checked={checked} className="ev-switch ev-switch-s-sm" onClick={() => onCheckedChange(!checked)} {...aria}>
      <span className="ev-switch-thumb" />
    </button>
  );
}
