"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import PremiumDashboard from "./premium-dashboard";
import {
  BarChart3,
  BookOpen,
  Briefcase,
  Check,
  ChevronDown,
  CircleCheckBig,
  Clapperboard,
  Clock3,
  Coffee,
  Crown,
  Flame,
  Heart,
  Home as HomeIcon,
  LockKeyhole,
  LogOut,
  PartyPopper,
  Pause,
  Play,
  Plus,
  Sparkles,
  Square,
  Timer,
  Trophy,
} from "lucide-react";

type TaskCategory = "Study" | "Productive" | "Entertainment" | "Daily essentials";
const TASK_CATEGORIES: TaskCategory[] = ["Study", "Productive", "Entertainment", "Daily essentials"];

type PublicProfile = {
  id: string;
  name: string;
  avatar: string;
  accent: "coral" | "sage";
};

type Task = {
  id: string;
  title: string;
  category: TaskCategory;
  durationMinutes: number;
  points: number;
  scheduleType: "once" | "daily" | "weekdays" | "weekly";
  scheduledDate: string | null;
  scheduledWeekday: number | null;
  animationKey: "study" | "study-planning" | "cooking" | "auto";
  completedAt: string | null;
  activeSession: {
    id: string;
    startedAt: string;
    pausedSeconds: number;
    pausePoints: number;
    currentPause: { id: string; category: TaskCategory; startedAt: string } | null;
  } | null;
};

type DashboardProfile = PublicProfile & {
  isCurrent: boolean;
  score: number;
  weeklyCompleted: number;
  focusMinutes: { study: number; productive: number };
  todayCompleted: number;
  totalToday: number;
  busy: {
    taskId: string;
    taskTitle: string;
    category: TaskCategory;
    durationMinutes: number;
    startedAt: string;
    currentPause: { id: string; category: TaskCategory; startedAt: string } | null;
  } | null;
  tasks: Task[];
};

type DashboardData = {
  generatedAt: string;
  user: PublicProfile;
  profiles: DashboardProfile[];
  recentActivity: Array<{
    id: string;
    completed_at: string;
    points_earned: number;
    profile_id: string;
    profile_name: string;
    task_title: string;
    category: TaskCategory;
  }>;
};

type AuthStatus = {
  configured: boolean;
  couple?: { id: string; name: string };
  profiles: PublicProfile[];
  user: PublicProfile | null;
};

const todayKey = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};

const weekStartKey = () => {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};

const friendlyDate = new Intl.DateTimeFormat("en", {
  weekday: "long",
  day: "numeric",
  month: "long",
}).format(new Date());

const calendarNow = new Date();
const yearStart = new Date(calendarNow.getFullYear(), 0, 1);
const weekNumber = Math.ceil(
  ((calendarNow.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7,
);

function elapsedLabel(startedAt: string, now: number) {
  const minutes = Math.max(1, Math.floor((now - new Date(startedAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function categorySlug(category: TaskCategory) {
  return category.toLowerCase().replace(" ", "-");
}

function CategoryIcon({ category, size = 16 }: { category: TaskCategory; size?: number }) {
  if (category === "Study") return <BookOpen size={size} aria-hidden="true" />;
  if (category === "Productive") return <Briefcase size={size} aria-hidden="true" />;
  if (category === "Entertainment") return <Clapperboard size={size} aria-hidden="true" />;
  return <Coffee size={size} aria-hidden="true" />;
}

function scoreRule(task: Task) {
  if (!task.durationMinutes) return task.category === "Entertainment" ? "No points" : "+5 pts";
  if (task.category === "Entertainment") return "−0.5 pts/min";
  if (task.category === "Daily essentials") return "1 pt/min + 5";
  return "2 pts/min + 5";
}

function formatPoints(points: number) {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

function formatFocusTime(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded}m`;
  return `${Math.floor(rounded / 60)}h ${rounded % 60}m`;
}

function countdownState(task: Pick<Task, "durationMinutes" | "category" | "activeSession">, now: number) {
  if (!task.activeSession) return null;
  const currentPauseSeconds = task.activeSession.currentPause
    ? Math.max(0, Math.floor((now - Date.parse(task.activeSession.currentPause.startedAt)) / 1000))
    : 0;
  const elapsedSeconds = Math.max(
    0,
    Math.floor(
      (now - Date.parse(task.activeSession.startedAt)) / 1000 -
        Math.max(0, Number(task.activeSession.pausedSeconds) || 0) -
        currentPauseSeconds,
    ),
  );
  const remainingSeconds = Math.trunc(task.durationMinutes * 60 - elapsedSeconds);
  const absoluteSeconds = Math.abs(remainingSeconds);
  const hours = Math.floor(absoluteSeconds / 3600);
  const minutes = Math.floor((absoluteSeconds % 3600) / 60);
  const seconds = absoluteSeconds % 60;
  const clock = `${hours ? `${String(hours).padStart(2, "0")}:` : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const elapsedMinutes = elapsedSeconds / 60;
  const rate = task.category === "Entertainment" ? -0.5 : task.category === "Daily essentials" ? 1 : 2;
  const bonus = task.category === "Entertainment" ? 0 : 5;
  const currentPauseRate = task.activeSession.currentPause?.category === "Entertainment"
    ? -0.5
    : task.activeSession.currentPause?.category === "Daily essentials"
      ? 1
      : 2;
  const livePausePoints = task.activeSession.pausePoints + (currentPauseSeconds / 60) * currentPauseRate;
  return {
    label: `${remainingSeconds < 0 ? "−" : ""}${clock}`,
    overtime: remainingSeconds < 0,
    elapsedMinutes,
    livePoints: Math.round((bonus + elapsedMinutes * rate + livePausePoints) * 10) / 10,
    paused: Boolean(task.activeSession.currentPause),
    pauseCategory: task.activeSession.currentPause?.category ?? null,
    pauseElapsed: task.activeSession.currentPause ? elapsedLabel(task.activeSession.currentPause.startedAt, now) : null,
  };
}

function liveFocusMinutes(profile: DashboardProfile, kind: "study" | "productive", now: number, generatedAt: string) {
  const base = profile.focusMinutes[kind];
  const expectedCategory = kind === "study" ? "Study" : "Productive";
  const liveCategory = profile.busy?.currentPause?.category ?? profile.busy?.category;
  if (!profile.busy || liveCategory !== expectedCategory) return base;
  return base + Math.max(0, now - Date.parse(generatedAt)) / 60000;
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Something went wrong");
  return payload;
}

function MiniMark() {
  return (
    <span className="mini-mark" aria-hidden="true">
      <i />
      <i />
    </span>
  );
}

function SetupScreen({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/auth/setup", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t create your space");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="brand brand-light"><MiniMark /> twogether.</div>
        <div className="story-copy">
          <span className="eyebrow light">A little better, together</span>
          <h1>Build your days.<br />Cheer each other on.</h1>
          <p>A calm space for two people to keep promises, share progress, and make the everyday feel like a team sport.</p>
        </div>
        <div className="story-proof">
          <div className="proof-faces"><span>A</span><span>B</span></div>
          <p><strong>Private by design</strong><br />Your check-ins stay yours. Your wins are shared.</p>
        </div>
      </section>

      <section className="auth-panel">
        <form className="setup-card" onSubmit={submit}>
          <span className="step-pill">ONE-TIME SETUP</span>
          <h2>Create your shared space</h2>
          <p className="muted">Add the two people who will use this app. Each person gets a private PIN.</p>

          <label className="field-label">
            What do you call your space?
            <input name="coupleName" placeholder="Our little corner" defaultValue="Our little corner" maxLength={50} required />
          </label>

          <div className="person-fields sage-fields">
            <span className="person-number">01</span>
            <label className="field-label">Your name<input name="firstName" placeholder="Your name" maxLength={30} required /></label>
            <label className="field-label">Your private PIN<input name="firstPin" inputMode="numeric" type="password" placeholder="4–8 digits" minLength={4} maxLength={8} pattern="[0-9]+" required /></label>
          </div>

          <div className="person-fields coral-fields">
            <span className="person-number">02</span>
            <label className="field-label">Partner’s name<input name="secondName" placeholder="Their name" maxLength={30} required /></label>
            <label className="field-label">Their private PIN<input name="secondPin" inputMode="numeric" type="password" placeholder="4–8 digits" minLength={4} maxLength={8} pattern="[0-9]+" required /></label>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={saving}>{saving ? "Creating your space…" : "Create our space"}<span>→</span></button>
          <p className="form-note">Starter routines will be added for both of you. You can add your own next.</p>
        </form>
      </section>
    </main>
  );
}

function LoginScreen({ status, onDone }: { status: AuthStatus; onDone: () => void }) {
  const [selected, setSelected] = useState(status.profiles[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ profileId: selected, pin }) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t sign in");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-orbit orbit-one" /><div className="login-orbit orbit-two" />
      <section className="login-card">
        <div className="brand"><MiniMark /> twogether.</div>
        <span className="eyebrow">{status.couple?.name}</span>
        <h1>Who’s checking in?</h1>
        <p className="muted">Choose your profile. You’ll only be able to update your own routines.</p>
        <form onSubmit={submit}>
          <div className="profile-picker">
            {status.profiles.map((profile) => (
              <button
                type="button"
                key={profile.id}
                className={`profile-choice ${profile.accent} ${selected === profile.id ? "selected" : ""}`}
                onClick={() => { setSelected(profile.id); setPin(""); }}
                aria-pressed={selected === profile.id}
              >
                <span className="profile-avatar">{profile.avatar}</span>
                <span>{profile.name}</span>
                <small>{selected === profile.id ? "That’s me" : "Choose"}</small>
              </button>
            ))}
          </div>
          <label className="field-label pin-field">Private PIN<input value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" type="password" placeholder="••••" minLength={4} maxLength={8} required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={saving || !selected}>{saving ? "Checking…" : "Open my day"}<span>→</span></button>
        </form>
      </section>
    </main>
  );
}

function ProgressRing({ done, total, accent = "coral" }: { done: number; total: number; accent?: string }) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={`progress-ring ${accent}`} style={{ "--progress": `${percent * 3.6}deg` } as React.CSSProperties} aria-label={`${percent}% complete`}>
      <span><strong>{percent}%</strong><small>complete</small></span>
    </div>
  );
}

function TaskRow({ task, onAction, onPause, now, busy }: {
  task: Task;
  onAction: (task: Task, action: "toggle" | "start" | "finish" | "resume") => void;
  onPause: (task: Task) => void;
  now: number;
  busy: boolean;
}) {
  const timed = task.durationMinutes > 0;
  const active = Boolean(task.activeSession);
  const countdown = countdownState(task, now);
  const category = categorySlug(task.category);
  return (
    <article className={`task-row category-${category} ${task.completedAt ? "done" : ""} ${active ? "active" : ""} ${countdown?.paused ? "paused" : ""} ${countdown?.overtime ? "overtime" : ""}`}>
      <button
        className="task-check"
        onClick={() => onAction(task, timed ? (countdown?.paused ? "resume" : active ? "finish" : "start") : "toggle")}
        aria-label={task.completedAt ? `Mark ${task.title} incomplete` : timed ? `${countdown?.paused ? "Resume" : active ? "Finish" : "Start"} ${task.title}` : `Complete ${task.title}`}
        disabled={Boolean(task.completedAt && timed) || (timed && busy && !active)}
      >
        {task.completedAt
          ? <Check size={16} strokeWidth={3} />
          : countdown?.paused
            ? <Play size={13} fill="currentColor" />
            : active
              ? <Square size={10} fill="currentColor" />
              : timed
                ? <Play size={13} fill="currentColor" />
                : null}
      </button>
      <div className="task-copy">
        <div><span className={`task-category-icon ${category}`}><CategoryIcon category={task.category} size={14} /></span><h3>{task.title}</h3>{active && <span className={`live-pill ${countdown?.paused ? categorySlug(countdown.pauseCategory!) : category}`}><i /> {countdown?.paused ? `PAUSED · ${countdown.pauseCategory}` : "LIVE"}</span>}</div>
        <p><span className={`category-label ${category}`}>{task.category}</span>{task.durationMinutes > 0 && <><b>·</b><span>{task.durationMinutes} min target</span></>}<b>·</b><span>{scoreRule(task)}</span></p>
      </div>
      <div className="task-time">
        {task.completedAt ? <><strong>Done</strong><small>{new Date(task.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></> : countdown ? <div className={`countdown ${category} ${countdown.paused ? "paused" : ""} ${countdown.overtime ? "overtime" : ""}`}><strong>{countdown.label}</strong><small>{countdown.paused ? `${countdown.pauseCategory} pause · ${countdown.pauseElapsed}` : countdown.overtime ? "overtime" : "remaining"} · session {countdown.livePoints > 0 ? "+" : ""}{formatPoints(countdown.livePoints)} pts</small><div className="timer-actions">{countdown.paused ? <button className="resume-button" onClick={() => onAction(task, "resume")}><Play size={10} fill="currentColor" /> Resume</button> : <button className="pause-button" onClick={() => onPause(task)}><Pause size={10} fill="currentColor" /> Pause</button>}<button onClick={() => onAction(task, "finish")}><Check size={11} strokeWidth={3} /> Finish</button></div></div> : timed ? <span className="start-label"><Play size={10} fill="currentColor" /> Start timer</span> : <span>Today</span>}
      </div>
    </article>
  );
}

export function LegacyDashboard({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [pauseTask, setPauseTask] = useState<Task | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<{ title: string; id: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api<DashboardData>(`/api/dashboard?date=${todayKey()}&from=${weekStartKey()}`);
      setData(result);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t load your day");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const initialTick = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => { window.clearTimeout(initialTick); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setCelebration(null), 2300);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  const me = data?.profiles.find((profile) => profile.isCurrent);
  const partner = data?.profiles.find((profile) => !profile.isCurrent);
  const winner = useMemo(() => {
    if (!me || !partner || me.score === partner.score) return null;
    return me.score > partner.score ? me : partner;
  }, [me, partner]);

  async function taskAction(task: Task, action: "toggle" | "start" | "finish" | "resume") {
    setBusyId(task.id);
    setError("");
    try {
      await api(`/api/tasks/${task.id}/${action === "toggle" ? "complete" : action}`, {
        method: "POST",
        body: JSON.stringify({ date: todayKey() }),
      });
      if (action === "finish" || (action === "toggle" && !task.completedAt)) {
        setCelebration({ title: task.title, id: Date.now() });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t update that routine");
    } finally {
      setBusyId("");
    }
  }

  async function pauseFor(category: TaskCategory) {
    if (!pauseTask) return;
    setBusyId(pauseTask.id);
    setError("");
    try {
      await api(`/api/tasks/${pauseTask.id}/pause`, {
        method: "POST",
        body: JSON.stringify({ category }),
      });
      setPauseTask(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t pause that routine");
    } finally {
      setBusyId("");
    }
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusyId("new");
    try {
      await api("/api/tasks", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
      setAddOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t add that routine");
    } finally {
      setBusyId("");
    }
  }

  if (!data || !me || !partner) {
    return <main className="loading-page"><MiniMark /><p>{error || "Bringing your day together…"}</p><button onClick={load}>Try again</button></main>;
  }

  const scoreMax = Math.max(1, Math.abs(me.score), Math.abs(partner.score));
  const completedTotal = me.todayCompleted + partner.todayCompleted;
  const taskTotal = me.totalToday + partner.totalToday;
  const partnerBusyTask = partner.busy ? partner.tasks.find((task) => task.id === partner.busy!.taskId) : null;
  const partnerCountdown = partnerBusyTask ? countdownState(partnerBusyTask, now ?? Date.parse(partnerBusyTask.activeSession!.startedAt)) : null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><MiniMark /> twogether.</div>
        <nav aria-label="Main navigation">
          <a className="active" href="#today"><span><HomeIcon size={17} /></span> Today</a>
          <a href="#progress"><span><BarChart3 size={17} /></span> Progress</a>
          <a href="#activity"><span><Clock3 size={17} /></span> Activity</a>
        </nav>
        <div className="sidebar-note">
          <span>WEEKLY NOTE</span>
          <p>Small steps count.<br />Especially the shared ones.</p>
          <i><Heart size={42} fill="currentColor" /></i>
        </div>
        <button className="signout" onClick={onLogout}><LogOut size={15} /> Switch profile</button>
      </aside>

      <main className="dashboard">
        <header className="topbar">
          <div className="mobile-brand brand"><MiniMark /> twogether.</div>
          <p>{friendlyDate}</p>
          <button className={`user-chip ${me.accent}`} onClick={onLogout} title="Switch profile">
            <span>{me.avatar}</span><b>{me.name}</b><ChevronDown size={14} />
          </button>
        </header>

        <section className="welcome" id="today">
          <div>
            <span className="eyebrow">YOUR SHARED RHYTHM</span>
            <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {me.name} <span>✦</span></h1>
            <p>One gentle win at a time. You’ve got this.</p>
          </div>
          <div className="welcome-sticker" aria-hidden="true">
            <span className="sticker-spark"><Sparkles size={18} fill="currentColor" /></span>
            <Flame className="sticker-flame" size={26} fill="currentColor" />
            <strong>TEAM DAY</strong><small>little wins club</small>
          </div>
          <button className="add-button" onClick={() => setAddOpen(true)}><Plus size={15} /> Add routine</button>
        </section>

        {partner.busy && partnerBusyTask ? (
          <section className={`presence-banner category-${categorySlug(partnerCountdown?.pauseCategory ?? partner.busy.category)} ${partnerCountdown?.paused ? "paused" : ""} ${partnerCountdown?.overtime ? "overtime" : ""}`}>
            <span className={`avatar ${partner.accent}`}>{partner.avatar}<i /></span>
            <div><strong>{partner.name} is {partnerCountdown?.paused ? `paused for ${partnerCountdown.pauseCategory}` : "in focus mode"}</strong><p>{partner.busy.taskTitle} · {partnerCountdown?.paused ? `${partnerCountdown.pauseElapsed} pause` : `${elapsedLabel(partner.busy.startedAt, now ?? Date.parse(partner.busy.startedAt))} elapsed`}</p></div>
            <span className="presence-countdown">{partnerCountdown?.label}<small>{partnerCountdown?.paused ? "TIMER PAUSED" : partner.busy.category}</small></span>
          </section>
        ) : (
          <section className="presence-banner quiet">
            <span className={`avatar ${partner.accent}`}>{partner.avatar}<i /></span>
            <div><strong>{partner.name} is currently free</strong><p>No timed activity running right now.</p></div>
            <span className="presence-label"><Sparkles size={11} /> AVAILABLE</span>
          </section>
        )}

        {error && <div className="toast-error" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}

        <section className="dashboard-grid">
          <div className="main-column">
            <section className="card routines-card">
              <div className="card-heading">
                <div><span className="eyebrow">TODAY’S FOCUS</span><h2>Your routines</h2></div>
                <div className="completion-count"><strong>{me.todayCompleted}</strong><span>of {me.totalToday}<small>done</small></span></div>
              </div>
              <div className="task-list">
                {me.tasks.map((task) => <TaskRow key={task.id} task={task} onAction={taskAction} onPause={setPauseTask} now={now ?? (task.activeSession ? new Date(task.activeSession.startedAt).getTime() : 0)} busy={Boolean(me.busy || busyId)} />)}
              </div>
              <button className="text-button" onClick={() => setAddOpen(true)}><Plus size={13} /> Add another routine</button>
            </section>

            <section className="card progress-card" id="progress">
              <div className="card-heading"><div><span className="eyebrow">THIS WEEK</span><h2>Progress together</h2></div><span className="week-pill">MON — TODAY</span></div>
              <div className="progress-content">
                <ProgressRing done={completedTotal} total={taskTotal} accent="shared" />
                <div className="progress-details">
                  <div className="focus-totals">
                    <div className="study"><span><BookOpen size={16} /></span><p><small>STUDY TIME</small><strong>{formatFocusTime(liveFocusMinutes(me, "study", now ?? Date.parse(data.generatedAt), data.generatedAt))}</strong></p></div>
                    <div className="productive"><span><Briefcase size={16} /></span><p><small>PRODUCTIVE TIME</small><strong>{formatFocusTime(liveFocusMinutes(me, "productive", now ?? Date.parse(data.generatedAt), data.generatedAt))}</strong></p></div>
                  </div>
                  <div className="score-bars">
                    {[me, partner].map((profile) => (
                      <div className="score-bar" key={profile.id}>
                        <div><span className={`tiny-avatar ${profile.accent}`}>{profile.avatar}</span><strong>{profile.name}</strong><b>{formatPoints(profile.score)} pts</b></div>
                        <div className={`bar-track ${profile.score < 0 ? "negative" : ""}`}><i className={profile.score < 0 ? "negative" : profile.accent} style={{ width: `${Math.max(4, (Math.abs(profile.score) / scoreMax) * 100)}%` }} /></div>
                        <small>{profile.weeklyCompleted} routines completed</small>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="side-column">
            <section className="score-card">
              <div className="score-trophy" aria-hidden="true"><Trophy size={24} fill="currentColor" /><Sparkles size={12} /></div>
              <div className="score-top"><span className="eyebrow light">FRIENDLY FACE-OFF</span><span>WEEK {weekNumber}</span></div>
              <h2>{winner ? `${winner.name} is in the lead` : "Neck and neck"} <span>✦</span></h2>
              <p>{winner ? `${formatPoints(Math.abs(me.score - partner.score))} points between you. Plenty of week left.` : "You’re perfectly matched this week."}</p>
              <div className="versus">
                <div className={winner?.id === me.id ? "leader" : ""}><span className={`big-avatar ${me.accent}`}>{me.avatar}{winner?.id === me.id && <i><Crown size={10} fill="currentColor" /></i>}</span><strong>{me.name}</strong><b>{formatPoints(me.score)}</b><small>POINTS</small></div>
                <span className="vs">VS</span>
                <div className={winner?.id === partner.id ? "leader" : ""}><span className={`big-avatar ${partner.accent}`}>{partner.avatar}{winner?.id === partner.id && <i><Crown size={10} fill="currentColor" /></i>}</span><strong>{partner.name}</strong><b>{formatPoints(partner.score)}</b><small>POINTS</small></div>
              </div>
              <div className="shared-total"><span><Heart size={15} fill="currentColor" /></span><p>Together your net score is <strong>{formatPoints(me.score + partner.score)} points</strong> this week.</p></div>
            </section>

            <section className="card partner-card">
              <div className="card-heading"><div><span className="eyebrow">{partner.name.toUpperCase()}’S DAY</span><h2>Partner progress</h2></div><ProgressRing done={partner.todayCompleted} total={partner.totalToday} accent={partner.accent} /></div>
              <div className="partner-tasks">
                {partner.tasks.slice(0, 5).map((task) => (
                  <div key={task.id} className={task.completedAt ? "done" : task.activeSession ? "active" : ""}>
                    <span>{task.completedAt ? <Check size={11} strokeWidth={3} /> : task.activeSession ? <Play size={9} fill="currentColor" /> : <CategoryIcon category={task.category} size={10} />}</span>
                    <p><strong>{task.title}</strong><small>{task.activeSession ? `${countdownState(task, now ?? Date.parse(task.activeSession.startedAt))?.label} · ${countdownState(task, now ?? Date.parse(task.activeSession.startedAt))?.paused ? `Paused for ${countdownState(task, now ?? Date.parse(task.activeSession.startedAt))?.pauseCategory}` : task.category}` : task.completedAt ? new Date(task.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Not started"}</small></p>
                  </div>
                ))}
              </div>
              <p className="read-only-note">View only · Only {partner.name} can make changes</p>
            </section>
          </div>
        </section>

        <section className="card activity-card" id="activity">
          <div className="card-heading"><div><span className="eyebrow">RECENT CHECK-INS</span><h2>Your shared activity</h2></div></div>
          {data.recentActivity.length ? <div className="activity-list">{data.recentActivity.slice(0, 6).map((activity) => {
            const profile = data.profiles.find((item) => item.id === activity.profile_id)!;
            return <div key={activity.id}><span className={`tiny-avatar ${profile.accent}`}>{profile.avatar}</span><p><strong>{activity.profile_name}</strong> completed {activity.task_title}<small><CategoryIcon category={activity.category} size={9} /> {activity.category} · {new Date(activity.completed_at).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}</small></p><b className={activity.points_earned < 0 ? "negative" : ""}>{activity.points_earned > 0 ? "+" : ""}{formatPoints(activity.points_earned)}</b></div>;
          })}</div> : <p className="empty-activity">Your first check-in will appear here — a tiny record of a promise kept.</p>}
        </section>
      </main>

      {celebration && <div className="celebration" key={celebration.id} role="status" aria-live="polite">
        <div className="confetti" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties} />)}</div>
        <div className="celebration-sticker"><span><PartyPopper size={27} /></span><strong>Lovely work!</strong><small>{celebration.title} is complete</small><CircleCheckBig size={18} /></div>
      </div>}

      {addOpen && <div className="modal-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") setAddOpen(false); }} onMouseDown={(event) => { if (event.target === event.currentTarget) setAddOpen(false); }}>
        <form className="modal" onSubmit={addTask}>
          <button type="button" className="modal-close" onClick={() => setAddOpen(false)} aria-label="Close">×</button>
          <span className="step-pill">NEW ROUTINE</span><h2>Add something for you</h2><p className="muted">Only you can check it off or start its timer.</p>
          <label className="field-label">Routine name<input name="title" placeholder="Read ten pages" maxLength={80} required /></label>
          <div className="modal-fields"><label className="field-label">Category<select name="category" defaultValue="Study"><option>Study</option><option>Productive</option><option>Entertainment</option><option>Daily essentials</option></select></label><label className="field-label">Duration (minutes)<input name="durationMinutes" type="number" min="0" max="240" defaultValue="25" /></label></div>
          <div className="category-rules"><span className="study">Study <b>2 pts/min</b></span><span className="productive">Productive <b>2 pts/min</b></span><span className="entertainment">Entertainment <b>−0.5/min</b></span><span className="daily-essentials">Essentials <b>1 pt/min</b></span></div>
          <div className="timer-note"><span><Timer size={18} /></span><p><strong>Any duration starts a countdown.</strong><br />It keeps running past zero until you finish. Non-entertainment routines also receive a 5-point completion bonus.</p></div>
          <button className="primary-button" disabled={busyId === "new"}>{busyId === "new" ? "Adding…" : "Add to my day"}<span>→</span></button>
        </form>
      </div>}

      {pauseTask && <div className="modal-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") setPauseTask(null); }} onMouseDown={(event) => { if (event.target === event.currentTarget) setPauseTask(null); }}>
        <section className="modal pause-modal" aria-modal="true" role="dialog" aria-labelledby="pause-title">
          <button type="button" className="modal-close" onClick={() => setPauseTask(null)} aria-label="Close">×</button>
          <span className="step-pill">PAUSE TRACKING</span>
          <h2 id="pause-title">What are you pausing for?</h2>
          <p className="muted">The {pauseTask.title} countdown will freeze. Your pause time will be tracked separately until you resume.</p>
          <div className="pause-options">
            {TASK_CATEGORIES.filter((category) => category !== pauseTask.category).map((category) => (
              <button key={category} className={categorySlug(category)} onClick={() => pauseFor(category)} disabled={busyId === pauseTask.id}>
                <span><CategoryIcon category={category} size={15} /></span>
                <strong>{category}</strong>
                <small>{category === "Entertainment" ? "−0.5 pts/min" : category === "Daily essentials" ? "1 pt/min" : "2 pts/min"}</small>
              </button>
            ))}
          </div>
          <p className="pause-note"><LockKeyhole size={10} /> Only the other three categories are available because this routine is already tracked as {pauseTask.category}.</p>
        </section>
      </div>}
    </div>
  );
}

export default function Home() {
  const [status, setStatus] = useState<AuthStatus | null>(null);

  const refreshStatus = useCallback(async () => {
    const result = await api<AuthStatus>("/api/auth/status");
    setStatus(result);
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void refreshStatus(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [refreshStatus]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    await refreshStatus();
  }

  if (!status) return <main className="loading-page"><MiniMark /><p>Making space for two…</p></main>;
  if (!status.configured) return <SetupScreen onDone={refreshStatus} />;
  if (!status.user) return <LoginScreen status={status} onDone={refreshStatus} />;
  return <PremiumDashboard onLogout={logout} />;
}
