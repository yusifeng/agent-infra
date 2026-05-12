import clsx from 'clsx';

type ModeIconProps = {
  selected?: boolean;
  className?: string;
};

export function QuickModeIcon({ selected = false, className }: ModeIconProps) {
  return selected ? (
    <svg
      aria-hidden="true"
      className={clsx(className)}
      fill="none"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M13.6516 6.87891L6.85747 15.2114C6.60065 15.5263 6.09224 15.302 6.15178 14.9L6.8431 10.2324C6.87889 9.99077 6.69167 9.77378 6.44742 9.77378L2.65846 9.77378C2.32132 9.77378 2.1354 9.38229 2.34845 9.121L9.14256 0.788538C9.39938 0.473563 9.90779 0.697894 9.84825 1.09992L9.15693 5.76753C9.12114 6.00914 9.30836 6.22613 9.55261 6.22613L13.3416 6.22613C13.6787 6.22613 13.8646 6.61762 13.6516 6.87891Z" fill="currentColor" />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      className={clsx(className)}
      fill="none"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M13.1631 6.76904L6.6497 14.7572C6.52129 14.9147 6.26708 14.8025 6.29685 14.6015L7.00998 9.78665C7.02788 9.66585 6.93427 9.55735 6.81214 9.55735L2.99201 9.55735C2.82344 9.55735 2.73048 9.36161 2.837 9.23096L9.35037 1.2428C9.47879 1.08531 9.73299 1.19748 9.70322 1.39849L8.99009 6.21335C8.9722 6.33416 9.06581 6.44265 9.18793 6.44265L13.0081 6.44265C13.1766 6.44265 13.2696 6.6384 13.1631 6.76904Z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

export function ExpertModeIcon({ selected = false, className }: ModeIconProps) {
  return selected ? (
    <svg
      aria-hidden="true"
      className={clsx(className)}
      fill="none"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M11.0289 2.0918C11.6941 2.09186 12.3154 2.42299 12.6871 2.97461L14.8414 6.1709C15.0959 6.54892 15.0625 7.05142 14.7604 7.39258L8.74866 14.1768C8.35077 14.6257 7.64952 14.6257 7.25159 14.1768L1.23987 7.39258C0.937742 7.05136 0.905152 6.54892 1.15979 6.1709L3.31213 2.97461C3.68383 2.42281 4.306 2.0918 4.97131 2.0918H11.0289ZM3.41858 5.46484V6.76562H12.5817V5.46484H3.41858Z" fill="currentColor" />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      className={clsx(className)}
      fill="none"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7.99969 2.14671H10.7951C11.4603 2.14671 12.082 2.47747 12.4537 3.02915L14.4258 5.95608C14.6806 6.33422 14.6474 6.83683 14.3449 7.17809L8.74814 13.4937C8.35021 13.9427 7.64919 13.9427 7.25128 13.4937L1.65509 7.17801C1.35274 6.83679 1.31945 6.33426 1.57416 5.95614L3.54568 3.02935C3.91738 2.47755 4.53914 2.14671 5.20445 2.14671H7.99969Z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M3.84998 6.08791H12.1504" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
