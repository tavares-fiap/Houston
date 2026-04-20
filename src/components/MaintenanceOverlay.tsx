export default function MaintenanceOverlay() {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="maintenance-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <div className="max-w-md w-full rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl text-center">
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-12 w-12 text-yellow-400 mx-auto mb-4"
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" x2="12" y1="9" y2="13" />
          <line x1="12" x2="12.01" y1="17" y2="17" />
        </svg>
        <h1 id="maintenance-title" className="text-xl font-semibold text-zinc-100 mb-2">
          Houston is temporarily offline
        </h1>
        <p className="text-sm text-zinc-300 leading-relaxed mb-4">
          Houston is temporarily unavailable due to the Vercel April 2026 security incident.
          We&apos;ve paused the app while the situation is being investigated and mitigated.
          Thank you for your patience.
        </p>
        <a
          href="https://vercel.com/kb/bulletin/vercel-april-2026-security-incident"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm text-blue-400 underline underline-offset-4 hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-900 rounded"
        >
          Read Vercel&apos;s incident bulletin →
        </a>
      </div>
    </div>
  );
}
