// Minimal line-based SVG icons for the demo toolbar.
// No emoji — clean geometric shapes per TripleA Digital style.

interface IconProps {
  size?: number
}

export function IconTreeHorizontal({
  size = 18,
}: IconProps): React.ReactElement {
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
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M7 12 H13 V6 H17 M13 12 V18 H17" />
    </svg>
  )
}

export function IconTreeVertical({ size = 18 }: IconProps): React.ReactElement {
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
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="19" r="2" />
      <path d="M12 7 V13 H6 V17 M12 13 H18 V17" />
    </svg>
  )
}

export function IconRadial({ size = 18 }: IconProps): React.ReactElement {
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
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="4" r="1.5" />
      <circle cx="20" cy="12" r="1.5" />
      <circle cx="12" cy="20" r="1.5" />
      <circle cx="4" cy="12" r="1.5" />
      <path d="M12 6 V10 M14 12 H18 M12 14 V18 M6 12 H10" />
    </svg>
  )
}

export function IconFit({ size = 18 }: IconProps): React.ReactElement {
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
      aria-hidden="true"
    >
      <path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

export function IconUndo({ size = 18 }: IconProps): React.ReactElement {
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
      aria-hidden="true"
    >
      <path d="M9 7 L4 12 L9 17" />
      <path d="M4 12 H14 a4 4 0 0 1 4 4 v2" />
    </svg>
  )
}

export function IconRedo({ size = 18 }: IconProps): React.ReactElement {
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
      aria-hidden="true"
    >
      <path d="M15 7 L20 12 L15 17" />
      <path d="M20 12 H10 a4 4 0 0 0 -4 4 v2" />
    </svg>
  )
}

export function IconPanelToggle({ size = 18 }: IconProps): React.ReactElement {
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
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </svg>
  )
}

export function IconKeyboard({ size = 18 }: IconProps): React.ReactElement {
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
      aria-hidden="true"
    >
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10 H7.01 M10 10 H10.01 M13 10 H13.01 M16 10 H16.01 M8 14 H16" />
    </svg>
  )
}

export function IconPencil({ size = 18 }: IconProps): React.ReactElement {
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
      aria-hidden="true"
    >
      <path d="M4 20 L8.5 19 L19 8.5 L15.5 5 L5 15.5 Z" />
      <path d="M13.5 7 L17 10.5" />
    </svg>
  )
}

export function IconCopy({ size = 18 }: IconProps): React.ReactElement {
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
      aria-hidden="true"
    >
      <rect x="8" y="8" width="10" height="10" rx="2" />
      <path d="M6 16 H5 a2 2 0 0 1 -2 -2 V5 a2 2 0 0 1 2 -2 h9 a2 2 0 0 1 2 2 v1" />
    </svg>
  )
}

export function IconX({ size = 18 }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6 L18 18 M18 6 L6 18" />
    </svg>
  )
}

const layoutIcons: Record<string, (props: IconProps) => React.ReactElement> = {
  'tree-horizontal': IconTreeHorizontal,
  'tree-vertical': IconTreeVertical,
  radial: IconRadial,
}

const layoutLabels: Record<string, string> = {
  'tree-horizontal': 'Horizontal tree',
  'tree-vertical': 'Vertical tree',
  radial: 'Radial',
}

export function LayoutIcon({
  mode,
  size,
}: {
  mode: string
  size?: number
}): React.ReactElement {
  const Icon = layoutIcons[mode] ?? IconTreeHorizontal
  return <Icon size={size} />
}

export function layoutLabel(mode: string): string {
  return layoutLabels[mode] ?? mode
}
