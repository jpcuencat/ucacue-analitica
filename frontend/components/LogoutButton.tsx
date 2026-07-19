"use client";

import { useEffect, useState } from "react";
import { logoutAction } from "@/app/login/action";

export function LogoutButton() {
  const [from, setFrom] = useState("/");

  useEffect(() => {
    // Only preserve ?widget=true when actually inside an iframe.
    // Direct browser access to /?widget=true should logout to the full-page view.
    const inIframe = window.self !== window.top;
    const params = new URLSearchParams(window.location.search);
    if (!inIframe) params.delete("widget");
    const search = params.toString() ? `?${params.toString()}` : "";
    setFrom(window.location.pathname + search);
  }, []);

  return (
    <form action={logoutAction}>
      <input type="hidden" name="from" value={from} />
      <button
        type="submit"
        className="btn btn--logout"
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </form>
  );
}
