// RINSPACE_SHARED_SOURCE: portable class-name helper for vendored topbar controls.
export function topbarClassNames(...values: unknown[]) {
  return values
    .filter(
      (value): value is string => typeof value === "string" && Boolean(value),
    )
    .join(" ");
}
