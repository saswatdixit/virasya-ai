import type { SVGProps } from "react";

/**
 * Preserve a Story — Sovereign Archival Manuscript Icon
 * Communicates cultural preservation, traditional folios, oral memory, and storytelling.
 * Proportioned and weighted to match the Virasya design system.
 */
export function PreserveStoryIcon({
  size = 18,
  className = "",
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Archival Folio / Manuscript with stitched spine */}
      <path d="M4 19.5v-13A2.5 2.5 0 0 1 6.5 4H12v15.5H6.5A2.5 2.5 0 0 0 4 19.5z" />
      <path d="M20 19.5v-13A2.5 2.5 0 0 0 17.5 4H12v15.5h5.5A2.5 2.5 0 0 1 20 19.5z" />
      {/* Traditional inscribed oral narrative rhythm marks */}
      <path d="M7 8.5h2.5" />
      <path d="M7 12h2.5" />
      <path d="M14.5 8.5H17" />
      <path d="M14.5 12H17" />
      {/* Heritage bookmark cord with preservation pendant ribbon */}
      <path d="M12 4v5l1.5-1 1.5 1V4" fill="currentColor" fillOpacity="0.22" />
    </svg>
  );
}

/**
 * Cultural Host & Guilds Icon
 * Represents traditional custodians, temple mandapas, pavilions, and community guilds.
 */
export function CulturalHostIcon({
  size = 20,
  className = "",
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Stepped heritage pavilion / temple pediment */}
      <path d="M3 9.5l9-6.5 9 6.5" />
      <path d="M4 10h16v1.8H4z" fill="currentColor" fillOpacity="0.12" />
      {/* Classical fluted pillars of wisdom */}
      <path d="M6 12v6" />
      <path d="M10 12v6" />
      <path d="M14 12v6" />
      <path d="M18 12v6" />
      {/* Plinth and sovereign threshold */}
      <path d="M3 18.5h18" />
      <path d="M2 21h20" />
      <circle cx="12" cy="6" r="1.2" fill="currentColor" fillOpacity="0.3" />
    </svg>
  );
}

/**
 * Reusable Search Icon matching Virasya's 1.6 stroke standard
 */
export function SearchIcon({
  size = 18,
  className = "",
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

/**
 * Profile Icon
 */
export function ProfileIcon({
  size = 18,
  className = "",
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20c.8-3.5 3-5.3 6.5-5.3s5.7 1.8 6.5 5.3" />
    </svg>
  );
}

/**
 * Reusable "Coming Soon" Badge
 * Inherits the terracotta indicator dot, refined typography, and ivory/brown contrast.
 */
export function ComingSoonBadge({
  text = "Coming Soon",
  compact = false,
  className = "",
}: {
  text?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`badge-coming-soon ${compact ? "is-compact" : ""} ${className}`}
      role="status"
      aria-label={`${text} feature`}
    >
      <span className="badge-coming-soon-dot" aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}
