"use client";

import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect } from "react";

export default function AppError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Twogether page error", error);
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        path: window.location.href,
      }),
    }).catch(() => undefined);
  }, [error]);

  return <main className="premium-loading">
    <span className="premium-loading-heart"><AlertTriangle size={27} /></span>
    <div className="premium-loading-copy">
      <strong>Let’s get you back in.</strong>
      <p>The page hit a temporary display problem. Your tasks and progress are safe.</p>
      <div className="premium-error-actions">
        <button type="button" onClick={() => window.location.reload()}><RefreshCw size={14} /> Reload latest app</button>
        <button type="button" onClick={() => history.back()}><ArrowLeft size={14} /> Back</button>
      </div>
    </div>
  </main>;
}
