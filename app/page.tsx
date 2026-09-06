"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowRight, Heart, LockKeyhole, RefreshCw, ShieldCheck, Sparkles, Users } from "lucide-react";
import PremiumDashboard from "./premium-dashboard";

type PublicProfile = {
  id: string;
  name: string;
  avatar: string;
  accent: "coral" | "sage";
};

type AuthStatus = {
  configured: boolean;
  couple?: { id: string; name: string };
  profiles: PublicProfile[];
  user: PublicProfile | null;
};

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  } catch {
    throw new Error("Couldn’t reach Twogether. Check your connection and try again.");
  }
  let payload: T & { error?: string };
  try {
    payload = (await response.json()) as T & { error?: string };
  } catch {
    throw new Error(response.ok ? "Twogether returned an unexpected response" : `Request failed (${response.status})`);
  }
  if (!response.ok) throw new Error(payload.error || "Something went wrong");
  return payload;
}

function Brand() {
  return <div className="brand"><span><Heart size={18} fill="currentColor" /></span><strong>twogether.</strong></div>;
}

function SetupScreen({ onDone }: { onDone: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      await api("/api/auth/setup", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t create your shared space");
    } finally {
      setSaving(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-story" aria-labelledby="setup-story-title">
      <Brand />
      <div className="story-copy">
        <span className="eyebrow"><Sparkles size={14} /> A calmer way to move together</span>
        <h1 id="setup-story-title">Build better days.<br /><em>Together.</em></h1>
        <p>Plan what matters, focus without noise, and see each other’s progress without turning life into a spreadsheet.</p>
      </div>
      <div className="story-points">
        <span><ShieldCheck size={17} /><b>Private profiles</b></span>
        <span><Users size={17} /><b>Shared momentum</b></span>
        <span><LockKeyhole size={17} /><b>PIN protected</b></span>
      </div>
    </section>

    <section className="auth-panel">
      <form className="setup-card" onSubmit={submit}>
        <span className="step-pill">ONE-TIME SETUP</span>
        <h2>Create your space</h2>
        <p className="muted">Add both profiles now. Each person signs in with their own private PIN.</p>

        <label className="field-label">Shared space name<input name="coupleName" placeholder="Our little corner" defaultValue="Our little corner" maxLength={50} autoComplete="organization" required /></label>

        <div className="person-fields sage-fields">
          <span className="person-number">01</span>
          <div><strong>Your profile</strong><small>Only you use this PIN</small></div>
          <label className="field-label">Your name<input name="firstName" placeholder="Your name" maxLength={30} autoComplete="name" required /></label>
          <label className="field-label">Private PIN<input name="firstPin" inputMode="numeric" type="password" placeholder="4–8 digits" minLength={4} maxLength={8} pattern="[0-9]+" autoComplete="new-password" required /></label>
        </div>

        <div className="person-fields coral-fields">
          <span className="person-number">02</span>
          <div><strong>Partner profile</strong><small>They use their own PIN</small></div>
          <label className="field-label">Partner’s name<input name="secondName" placeholder="Their name" maxLength={30} autoComplete="off" required /></label>
          <label className="field-label">Private PIN<input name="secondPin" inputMode="numeric" type="password" placeholder="4–8 digits" minLength={4} maxLength={8} pattern="[0-9]+" autoComplete="new-password" required /></label>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={saving}>{saving ? "Creating your space…" : "Create our space"}<ArrowRight size={17} /></button>
        <p className="form-note"><LockKeyhole size={12} /> PINs are stored securely and can’t be displayed later.</p>
      </form>
    </section>
  </main>;
}

function LoginScreen({ status, onDone }: { status: AuthStatus; onDone: () => Promise<void> }) {
  const [selected, setSelected] = useState(status.profiles[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ profileId: selected, pin }) });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t sign in");
    } finally {
      setSaving(false);
    }
  }

  return <main className="login-page">
    <section className="login-card">
      <Brand />
      <span className="eyebrow">{status.couple?.name}</span>
      <h1>Who’s checking in?</h1>
      <p className="muted">Choose your profile, then enter your private PIN.</p>

      <form onSubmit={submit}>
        <fieldset className="profile-picker"><legend className="sr-only">Choose your profile</legend>
          {status.profiles.map((profile) => <button
            type="button"
            key={profile.id}
            className={`profile-choice ${profile.accent} ${selected === profile.id ? "selected" : ""}`}
            onClick={() => { setSelected(profile.id); setPin(""); setError(""); }}
            aria-pressed={selected === profile.id}
          >
            <span className="profile-avatar">{profile.avatar}</span>
            <span><strong>{profile.name}</strong><small>{selected === profile.id ? "Selected" : "Choose profile"}</small></span>
            <i aria-hidden="true">{selected === profile.id ? "✓" : ""}</i>
          </button>)}
        </fieldset>
        <label className="field-label pin-field">Private PIN<input value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" type="password" placeholder="••••" minLength={4} maxLength={8} pattern="[0-9]+" autoComplete="current-password" required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={saving || !selected}>{saving ? "Opening your day…" : "Open my day"}<ArrowRight size={17} /></button>
      </form>
      <p className="login-note"><LockKeyhole size={12} /> Your profile controls only your own tasks.</p>
    </section>
  </main>;
}

export default function Home() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loadError, setLoadError] = useState("");

  const refreshStatus = useCallback(async () => {
    setLoadError("");
    try {
      setStatus(await api<AuthStatus>("/api/auth/status"));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn’t open Twogether");
    }
  }, []);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => void refreshStatus(), 0);
    return () => window.clearTimeout(firstLoad);
  }, [refreshStatus]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    await refreshStatus();
  }

  if (!status) return <main className="loading-page">
    <Brand />
    {loadError ? <><p role="alert">{loadError}</p><button onClick={() => void refreshStatus()}><RefreshCw size={15} /> Try again</button></> : <><span className="loading-pulse" /><p>Preparing your shared day…</p></>}
  </main>;
  if (!status.configured) return <SetupScreen onDone={refreshStatus} />;
  if (!status.user) return <LoginScreen status={status} onDone={refreshStatus} />;
  return <PremiumDashboard onLogout={logout} />;
}
