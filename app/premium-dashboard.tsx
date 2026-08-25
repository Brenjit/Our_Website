"use client";

import type { AnimationItem } from "lottie-web";
import lottie from "lottie-web";
import {
  BarChart3,
  AlertTriangle,
  BookOpen,
  Briefcase,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  Clapperboard,
  Clock3,
  Coffee,
  Crown,
  Flame,
  GripVertical,
  Heart,
  Home,
  KeyRound,
  LockKeyhole,
  LogOut,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat2,
  Sparkles,
  Square,
  Timer,
  Trophy,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

type TaskCategory = "Study" | "Productive" | "Entertainment" | "Daily essentials";
type TaskSchedule = "once" | "daily" | "weekdays" | "weekly";
const TASK_CATEGORIES: TaskCategory[] = ["Study", "Productive", "Entertainment", "Daily essentials"];
const DURATION_PRESETS = [5, 10, 15, 30, 45, 60] as const;
type TimerCue = "start" | "resume" | "warning" | "finish";

const TIMER_CUE_PATTERNS: Record<TimerCue, Array<[delay: number, frequency: number, duration: number]>> = {
  start: [[0, 523, 0.16], [0.13, 659, 0.18], [0.28, 784, 0.28]],
  resume: [[0, 587, 0.14], [0.14, 784, 0.24]],
  warning: [[0, 880, 0.15], [0.2, 880, 0.15], [0.4, 988, 0.22]],
  finish: [[0, 784, 0.2], [0.18, 988, 0.2], [0.36, 1175, 0.42], [0.86, 784, 0.18], [1.04, 988, 0.2], [1.23, 1318, 0.56]],
};

function soundTimerCue(context: AudioContext, cue: TimerCue) {
  const pattern = TIMER_CUE_PATTERNS[cue];
  const startsAt = context.currentTime + 0.025;
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  master.gain.setValueAtTime(cue === "finish" ? 0.48 : cue === "warning" ? 0.4 : 0.34, startsAt);
  compressor.threshold.setValueAtTime(-12, startsAt);
  compressor.knee.setValueAtTime(12, startsAt);
  compressor.ratio.setValueAtTime(8, startsAt);
  master.connect(compressor);
  compressor.connect(context.destination);

  pattern.forEach(([delay, frequency, duration]) => {
    const noteStartsAt = startsAt + delay;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = cue === "finish" ? "square" : "sine";
    oscillator.frequency.setValueAtTime(frequency, noteStartsAt);
    envelope.gain.setValueAtTime(0.0001, noteStartsAt);
    envelope.gain.exponentialRampToValueAtTime(0.85, noteStartsAt + 0.018);
    envelope.gain.exponentialRampToValueAtTime(0.0001, noteStartsAt + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(noteStartsAt);
    oscillator.stop(noteStartsAt + duration + 0.025);
  });

  const cueLength = Math.max(...pattern.map(([delay, , duration]) => delay + duration));
  window.setTimeout(() => {
    master.disconnect();
    compressor.disconnect();
  }, (cueLength + 0.25) * 1000);

  if ("vibrate" in navigator) {
    if (cue === "finish") navigator.vibrate([220, 100, 220, 100, 420]);
    else if (cue === "warning") navigator.vibrate([100, 70, 100]);
    else navigator.vibrate(70);
  }
}

type PublicProfile = { id: string; name: string; avatar: string; accent: "coral" | "sage" };
type Task = {
  id: string;
  title: string;
  category: TaskCategory;
  durationMinutes: number;
  points: number;
  scheduleType: TaskSchedule;
  scheduledDate: string | null;
  scheduledWeekday: number | null;
  scheduledTime: string | null;
  animationKey: "study" | "study-planning" | "cooking" | "auto";
  sortOrder: number;
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
  isInitializer: boolean;
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

const LOTTIES = {
  studyMale: "/Lotties/Study_boy.json",
  studyFemale: "/Lotties/Reading%20girl.json",
  studyTogether: "/Lotties/Study%20discussion%20both.json",
  cooking: "/Lotties/Cooking.json",
  cookingTogether: "/Lotties/cooking%20together.json",
  natureFemale: "/Lotties/Reading%20in%20nature%20GIRL%20(default).json",
  sunrise: "/Lotties/sunrise.json",
} as const;

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

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Something went wrong");
  return payload;
}

function formatPoints(points: number) {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

function formatFocusTime(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded}m`;
  return `${Math.floor(rounded / 60)}h ${rounded % 60}m`;
}

function defaultScheduledTime() {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil((date.getMinutes() + 1) / 15) * 15);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatClockTime(time: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return "Choose a time";
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hours, minutes));
}

function formatCurrentClock(now: number) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(now));
}

function compactRelativeTime(milliseconds: number) {
  const totalMinutes = Math.max(1, Math.ceil(Math.abs(milliseconds) / 60000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function scheduleState(task: Task, now: number) {
  if (!task.scheduledTime) return { phase: "anytime" as const, label: "Anytime", detail: "No start time", timestamp: Number.POSITIVE_INFINITY };
  const [hours, minutes] = task.scheduledTime.split(":").map(Number);
  const start = new Date(now);
  start.setHours(hours, minutes, 0, 0);
  const startTime = start.getTime();
  const endTime = startTime + Math.max(task.durationMinutes, 15) * 60000;
  if (now < startTime) return {
    phase: "upcoming" as const,
    label: formatClockTime(task.scheduledTime),
    detail: `Starts in ${compactRelativeTime(startTime - now)}`,
    timestamp: startTime,
  };
  if (now <= endTime) return {
    phase: "now" as const,
    label: "Now",
    detail: `Planned until ${formatClockTime(`${String(new Date(endTime).getHours()).padStart(2, "0")}:${String(new Date(endTime).getMinutes()).padStart(2, "0")}`)}`,
    timestamp: startTime,
  };
  return {
    phase: "late" as const,
    label: "Late",
    detail: `${compactRelativeTime(now - startTime)} past ${formatClockTime(task.scheduledTime)}`,
    timestamp: startTime,
  };
}

function DurationPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const numericValue = Number(value);
  const presetSelected = DURATION_PRESETS.includes(numericValue as typeof DURATION_PRESETS[number]);
  const [customOpen, setCustomOpen] = useState(!presetSelected);

  return <section className="premium-duration-picker">
    <input type="hidden" name="durationMinutes" value={value} />
    <header><b>Focus duration</b><strong>{numericValue || 0}<span> min</span></strong></header>
    <div className="premium-duration-presets" role="group" aria-label="Focus duration">
      {DURATION_PRESETS.map((minutes) => <button type="button" key={minutes} className={!customOpen && numericValue === minutes ? "selected" : ""} onClick={() => { setCustomOpen(false); onChange(String(minutes)); }}>{minutes}<span>min</span></button>)}
      <button type="button" className={customOpen ? "selected" : ""} onClick={() => setCustomOpen(true)}>Custom</button>
    </div>
    {customOpen && <label className="premium-duration-custom"><span>Minutes</span><input type="number" inputMode="numeric" min="0" max="240" value={value} onChange={(event) => onChange(event.target.value)} /></label>}
  </section>;
}

function elapsedLabel(startedAt: string, now: number) {
  const minutes = Math.max(1, Math.floor((now - Date.parse(startedAt)) / 60000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function countdownState(task: Task, now: number) {
  if (!task.activeSession) return null;
  const openPauseSeconds = task.activeSession.currentPause
    ? Math.max(0, Math.floor((now - Date.parse(task.activeSession.currentPause.startedAt)) / 1000))
    : 0;
  const elapsedSeconds = Math.max(0, Math.floor(
    (now - Date.parse(task.activeSession.startedAt)) / 1000 -
      Math.max(0, Number(task.activeSession.pausedSeconds) || 0) -
      openPauseSeconds,
  ));
  const remainingSeconds = Math.trunc(task.durationMinutes * 60 - elapsedSeconds);
  const absolute = Math.abs(remainingSeconds);
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  const seconds = absolute % 60;
  const clock = `${hours ? `${String(hours).padStart(2, "0")}:` : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const rate = task.category === "Entertainment" ? -0.5 : task.category === "Daily essentials" ? 1 : 2;
  const bonus = task.category === "Entertainment" ? 0 : 5;
  const pauseRate = task.activeSession.currentPause?.category === "Entertainment"
    ? -0.5
    : task.activeSession.currentPause?.category === "Daily essentials" ? 1 : 2;
  const pausePoints = task.activeSession.pausePoints + (openPauseSeconds / 60) * pauseRate;
  return {
    label: `${remainingSeconds < 0 ? "−" : ""}${clock}`,
    remainingSeconds,
    overtime: remainingSeconds < 0,
    paused: Boolean(task.activeSession.currentPause),
    pauseCategory: task.activeSession.currentPause?.category ?? null,
    pauseElapsed: task.activeSession.currentPause ? elapsedLabel(task.activeSession.currentPause.startedAt, now) : null,
    elapsedMinutes: elapsedSeconds / 60,
    livePoints: Math.round((bonus + (elapsedSeconds / 60) * rate + pausePoints) * 10) / 10,
  };
}

function categorySlug(category: TaskCategory) {
  return category.toLowerCase().replace(" ", "-");
}

function CategoryIcon({ category, size = 18 }: { category: TaskCategory; size?: number }) {
  if (category === "Study") return <BookOpen size={size} />;
  if (category === "Productive") return <Briefcase size={size} />;
  if (category === "Entertainment") return <Clapperboard size={size} />;
  return <Coffee size={size} />;
}

function visualKind(task: Pick<Task, "title" | "category" | "animationKey"> | null | undefined) {
  if (!task) return null;
  if (task.animationKey === "cooking" || /cook|bake|meal|dinner|lunch|breakfast|kitchen|food/i.test(task.title)) return "cooking";
  if (task.animationKey === "study" || task.category === "Study" || /study|read|learn|exam|class|notes|revision|homework|assignment/i.test(task.title)) return "study";
  if (task.animationKey === "study-planning" || task.category === "Productive") return "planning";
  return null;
}

function suggestedKind(title: string, category: TaskCategory) {
  return visualKind({ title, category, animationKey: "auto" });
}

function isKaveri(profile: PublicProfile) {
  return /^kaveri(?:\s|$)/i.test(profile.name.trim());
}

function lottieFor(task: Task | null | undefined, profile: PublicProfile, together: boolean) {
  const kind = visualKind(task);
  if (kind === "cooking") return together ? LOTTIES.cookingTogether : LOTTIES.cooking;
  if (kind === "study") return together ? LOTTIES.studyTogether : isKaveri(profile) ? LOTTIES.studyFemale : LOTTIES.studyMale;
  if (kind === "planning") return isKaveri(profile) ? LOTTIES.studyFemale : LOTTIES.studyMale;
  return null;
}

function LottieMotion({ src, paused = false, cover = false, loop = true, className = "" }: { src: string; paused?: boolean; cover?: boolean; loop?: boolean; className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<AnimationItem | null>(null);
  const [loadedSrc, setLoadedSrc] = useState("");
  const [failedSrc, setFailedSrc] = useState("");
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const controller = new AbortController();
    fetch(src, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Animation request failed with ${response.status}`);
        return response.json();
      })
      .then((animationData: unknown) => {
        if (controller.signal.aborted) return;
        if (!animationData || typeof animationData !== "object") throw new Error("Animation data is invalid");
        const animation = lottie.loadAnimation({
          container,
          renderer: "svg",
          loop,
          autoplay: !paused,
          animationData,
          rendererSettings: { preserveAspectRatio: cover ? "xMidYMid slice" : "xMidYMid meet" },
        });
        animation.addEventListener("DOMLoaded", () => setLoadedSrc(src));
        animationRef.current = animation;
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === "AbortError")) setFailedSrc(src);
      });
    return () => {
      controller.abort();
      animationRef.current?.destroy();
      animationRef.current = null;
      container.replaceChildren();
    };
  }, [src, paused, cover, loop]);
  return <div className={`premium-lottie ${paused ? "is-paused" : ""} ${cover ? "is-cover" : ""} ${className}`}>
    <div ref={containerRef} className="premium-lottie-canvas" />
    {loadedSrc !== src && failedSrc !== src && <span className="premium-lottie-loader" />}
    {failedSrc === src && <span className="premium-lottie-error"><Sparkles size={34} /><small>Animation unavailable</small></span>}
  </div>;
}

function scheduleLabel(schedule: TaskSchedule) {
  if (schedule === "daily") return "Every day";
  if (schedule === "weekdays") return "Weekdays";
  if (schedule === "weekly") return "Weekly";
  return "Today";
}

function QueueTask({ task, busy, now, dragging, isFirst, isLast, onAction, onPause, onEdit, onDragStart, onMove }: {
  task: Task;
  busy: boolean;
  now: number;
  dragging: boolean;
  isFirst: boolean;
  isLast: boolean;
  onAction: (task: Task, action: "toggle" | "start" | "finish" | "resume") => void;
  onPause: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDragStart: (taskId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMove: (taskId: string, direction: -1 | 1) => void;
}) {
  const active = Boolean(task.activeSession);
  const timed = task.durationMinutes > 0;
  const countdown = countdownState(task, now);
  const schedule = scheduleState(task, now);
  return <article data-task-id={task.id} className={`premium-task category-${categorySlug(task.category)} ${task.completedAt ? "is-done" : ""} ${active ? "is-active" : ""} ${dragging ? "is-dragging" : ""} schedule-${schedule.phase}`}>
    <button
      type="button"
      className="premium-drag-handle"
      onPointerDown={(event) => onDragStart(task.id, event)}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" && !isFirst) { event.preventDefault(); onMove(task.id, -1); }
        if (event.key === "ArrowDown" && !isLast) { event.preventDefault(); onMove(task.id, 1); }
      }}
      aria-label={`Reorder ${task.title}. Use arrow keys or drag.`}
    ><GripVertical size={14} /></button>
    <button
      type="button"
      className={`premium-task-action ${categorySlug(task.category)}`}
      onClick={() => onAction(task, timed ? countdown?.paused ? "resume" : active ? "finish" : "start" : "toggle")}
      disabled={Boolean(task.completedAt && timed) || (timed && busy && !active)}
      aria-label={task.completedAt ? `${task.title} completed` : active ? `Finish ${task.title}` : `Start ${task.title}`}
    >
      {task.completedAt ? <Check size={17} strokeWidth={3} /> : countdown?.paused ? <Play size={14} fill="currentColor" /> : active ? <Square size={11} fill="currentColor" /> : <CategoryIcon category={task.category} size={16} />}
    </button>
    <div className="premium-task-copy">
      <div className="premium-task-title-row"><strong>{task.title}</strong><button type="button" onClick={() => onEdit(task)} disabled={active} aria-label={`Edit ${task.title}`}><Pencil size={11} /></button></div>
      <span><b>{task.category}</b> · {scheduleLabel(task.scheduleType)}{timed ? ` · ${task.durationMinutes} min` : ""}</span>
      {!task.completedAt && !active && <button type="button" className={`premium-task-schedule ${schedule.phase}`} onClick={() => onEdit(task)}><Clock3 size={9} /><b>{schedule.label}</b> · {schedule.detail}<Pencil size={9} /></button>}
    </div>
    {countdown ? <div className={`premium-task-live ${countdown.overtime ? "is-overtime" : ""}`}>
      <strong>{countdown.label}</strong>
      <div>{countdown.paused ? <button onClick={() => onAction(task, "resume")}><Play size={11} /> Resume</button> : <button onClick={() => onPause(task)}><Pause size={11} /> Pause</button>}</div>
    </div> : task.completedAt ? <span className="premium-done-time">Done</span> : timed ? <button className="premium-start-label" onClick={() => onAction(task, "start")} disabled={busy}><Play size={11} fill="currentColor" /> Start</button> : <button className="premium-start-label" onClick={() => onAction(task, "toggle")} disabled={busy}><Check size={11} /> Complete</button>}
  </article>;
}

function MiniProgress({ done, total }: { done: number; total: number }) {
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return <div className="premium-mini-progress" style={{ "--mini-progress": `${percent * 3.6}deg` } as CSSProperties}><span>{percent}%</span></div>;
}

export default function PremiumDashboard({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [pauseTask, setPauseTask] = useState<Task | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [completeToast, setCompleteToast] = useState("");
  const [plannerToast, setPlannerToast] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Task | "all" | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCategory, setDraftCategory] = useState<TaskCategory>("Study");
  const [draftSchedule, setDraftSchedule] = useState<TaskSchedule>("once");
  const [draftScheduled, setDraftScheduled] = useState(false);
  const [draftTime, setDraftTime] = useState(defaultScheduledTime);
  const [draftDuration, setDraftDuration] = useState("30");
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState<TaskCategory>("Study");
  const [editDuration, setEditDuration] = useState("25");
  const [editSchedule, setEditSchedule] = useState<TaskSchedule>("once");
  const [editDate, setEditDate] = useState(todayKey);
  const [editScheduled, setEditScheduled] = useState(false);
  const [editTime, setEditTime] = useState(defaultScheduledTime);
  const [taskOrder, setTaskOrder] = useState<string[] | null>(null);
  const taskOrderRef = useRef<string[]>([]);
  const [draggingTaskId, setDraggingTaskId] = useState("");
  const [activeTab, setActiveTab] = useState<"home" | "tasks" | "progress" | "activity">("home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [partnerPin, setPartnerPin] = useState("");
  const [confirmPartnerPin, setConfirmPartnerPin] = useState("");
  const [pinBusy, setPinBusy] = useState<"self" | "partner" | "">("");
  const [pinMessage, setPinMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playedTimerCuesRef = useRef<Set<string>>(new Set());
  const finishAlarmRef = useRef<{ sessionId: string; intervalId: number } | null>(null);
  const silencedAlarmSessionRef = useRef("");

  const prepareTimerAudio = useCallback(() => {
    if (typeof window === "undefined") return null;
    const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return null;
    if (!audioContextRef.current) audioContextRef.current = new AudioContextConstructor();
    if (audioContextRef.current.state === "suspended") void audioContextRef.current.resume();
    return audioContextRef.current;
  }, []);

  const playTimerCue = useCallback((cue: TimerCue) => {
    const context = prepareTimerAudio();
    if (!context) return;
    soundTimerCue(context, cue);
  }, [prepareTimerAudio]);

  const stopFinishAlarm = useCallback(() => {
    if (!finishAlarmRef.current) return;
    window.clearInterval(finishAlarmRef.current.intervalId);
    finishAlarmRef.current = null;
    if ("vibrate" in navigator) navigator.vibrate(0);
  }, []);

  const startFinishAlarm = useCallback((sessionId: string) => {
    if (finishAlarmRef.current?.sessionId === sessionId) return;
    stopFinishAlarm();
    playTimerCue("finish");
    const intervalId = window.setInterval(() => playTimerCue("finish"), 2100);
    finishAlarmRef.current = { sessionId, intervalId };
  }, [playTimerCue, stopFinishAlarm]);

  const load = useCallback(async () => {
    try {
      const result = await api<DashboardData>(`/api/dashboard?date=${todayKey()}&from=${weekStartKey()}`);
      setData(result);
      setTaskOrder(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t load your day");
    }
  }, []);

  useEffect(() => { const first = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(first); }, [load]);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    const unlock = () => { prepareTimerAudio(); };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      stopFinishAlarm();
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context && context.state !== "closed") void context.close();
    };
  }, [prepareTimerAudio, stopFinishAlarm]);
  useEffect(() => {
    if (!completeToast) return;
    const timer = window.setTimeout(() => setCompleteToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [completeToast]);
  useEffect(() => {
    if (!plannerToast) return;
    const timer = window.setTimeout(() => setPlannerToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [plannerToast]);

  const me = data?.profiles.find((profile) => profile.isCurrent);
  const partner = data?.profiles.find((profile) => !profile.isCurrent);
  const audibleTask = me?.busy ? me.tasks.find((task) => task.id === me.busy?.taskId) ?? null : null;
  const audibleTimer = audibleTask && data ? countdownState(audibleTask, now ?? Date.parse(data.generatedAt)) : null;
  const serverTaskIds = useMemo(() => me?.tasks.map((task) => task.id) ?? [], [me]);
  const winner = useMemo(() => {
    if (!me || !partner || me.score === partner.score) return null;
    return me.score > partner.score ? me : partner;
  }, [me, partner]);

  useEffect(() => {
    if (!audibleTask?.activeSession || !audibleTimer) {
      stopFinishAlarm();
      return;
    }
    const sessionId = audibleTask.activeSession.id;
    const warningKey = `${sessionId}:warning`;
    if (audibleTimer.remainingSeconds <= 0) {
      if (silencedAlarmSessionRef.current !== sessionId) startFinishAlarm(sessionId);
      return;
    }
    stopFinishAlarm();
    if (!audibleTimer.paused && audibleTimer.remainingSeconds <= 10 && !playedTimerCuesRef.current.has(warningKey)) {
      playedTimerCuesRef.current.add(warningKey);
      playTimerCue("warning");
    }
  }, [audibleTask, audibleTimer, playTimerCue, startFinishAlarm, stopFinishAlarm]);

  const persistTaskOrder = useCallback(async (orderedIds: string[]) => {
    try {
      await api("/api/tasks/reorder", { method: "POST", body: JSON.stringify({ orderedIds }) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save that task order");
      await load();
    }
  }, [load]);

  useEffect(() => {
    if (!draggingTaskId) return;
    const move = (event: PointerEvent) => {
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-task-id]");
      const targetId = target?.dataset.taskId;
      if (!targetId || targetId === draggingTaskId) return;
      setTaskOrder((current) => {
        const activeOrder = current ?? taskOrderRef.current;
        const from = activeOrder.indexOf(draggingTaskId);
        const to = activeOrder.indexOf(targetId);
        if (from < 0 || to < 0 || from === to) return current;
        const next = [...activeOrder];
        next.splice(to, 0, next.splice(from, 1)[0]);
        taskOrderRef.current = next;
        return next;
      });
    };
    const finish = () => {
      const orderedIds = [...taskOrderRef.current];
      setDraggingTaskId("");
      void persistTaskOrder(orderedIds);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [draggingTaskId, persistTaskOrder]);

  async function taskAction(task: Task, action: "toggle" | "start" | "finish" | "resume") {
    if (action === "start" || action === "resume" || action === "finish") prepareTimerAudio();
    const sessionId = task.activeSession?.id ?? "";
    if (action === "start") silencedAlarmSessionRef.current = "";
    if (action === "finish" && sessionId) {
      silencedAlarmSessionRef.current = sessionId;
      stopFinishAlarm();
    }
    setBusyId(task.id);
    setError("");
    try {
      await api(`/api/tasks/${task.id}/${action === "toggle" ? "complete" : action}`, { method: "POST", body: JSON.stringify({ date: todayKey() }) });
      if (action === "start" || action === "resume") setActiveTab("home");
      if (action === "start") playTimerCue("start");
      if (action === "resume") playTimerCue("resume");
      if (action === "finish" || (action === "toggle" && !task.completedAt)) setCompleteToast(task.title);
      await load();
    } catch (err) {
      if (action === "finish" && sessionId) {
        silencedAlarmSessionRef.current = "";
        const timerAtFailure = countdownState(task, Date.now());
        if (timerAtFailure && timerAtFailure.remainingSeconds <= 0) startFinishAlarm(sessionId);
      }
      setError(err instanceof Error ? err.message : "Couldn’t update that routine");
    } finally {
      setBusyId("");
    }
  }

  async function pauseFor(category: TaskCategory) {
    if (!pauseTask) return;
    setBusyId(pauseTask.id);
    try {
      await api(`/api/tasks/${pauseTask.id}/pause`, { method: "POST", body: JSON.stringify({ category }) });
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
      setDraftTitle("");
      setDraftCategory("Study");
      setDraftSchedule("once");
      setDraftScheduled(false);
      setDraftTime(defaultScheduledTime());
      setDraftDuration("30");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t add that routine");
    } finally {
      setBusyId("");
    }
  }

  function closeAddTask() {
    setAddOpen(false);
  }

  function openEditTask(task: Task) {
    if (task.activeSession) {
      setError("Finish the running session before changing its plan");
      return;
    }
    setEditTask(task);
    setEditTitle(task.title);
    setEditCategory(task.category);
    setEditDuration(String(task.durationMinutes));
    setEditSchedule(task.scheduleType);
    setEditDate(task.scheduledDate ?? todayKey());
    setEditScheduled(Boolean(task.scheduledTime));
    setEditTime(task.scheduledTime ?? defaultScheduledTime());
  }

  function closeEditTask() {
    setEditTask(null);
  }

  async function updateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTask) return;
    const form = new FormData(event.currentTarget);
    setBusyId(`edit-${editTask.id}`);
    setError("");
    try {
      await api(`/api/tasks/${editTask.id}`, { method: "PATCH", body: JSON.stringify(Object.fromEntries(form.entries())) });
      closeEditTask();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save those task changes");
    } finally {
      setBusyId("");
    }
  }

  async function removeTasks() {
    if (!deleteTarget) return;
    const clearingAll = deleteTarget === "all";
    setBusyId(clearingAll ? "delete-all" : `delete-${deleteTarget.id}`);
    setError("");
    try {
      await api(clearingAll ? "/api/tasks" : `/api/tasks/${deleteTarget.id}`, { method: "DELETE" });
      if (!clearingAll) closeEditTask();
      setDeleteTarget(null);
      setPlannerToast(clearingAll ? "Your task list is clear" : "Task removed from your planner");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t remove those tasks");
    } finally {
      setBusyId("");
    }
  }

  function closeSettings() {
    setSettingsOpen(false);
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setPartnerPin("");
    setConfirmPartnerPin("");
    setPinMessage(null);
  }

  async function changeOwnPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPinMessage(null);
    if (newPin !== confirmPin) {
      setPinMessage({ tone: "error", text: "The new PINs do not match." });
      return;
    }
    setPinBusy("self");
    try {
      await api("/api/auth/pin", { method: "PATCH", body: JSON.stringify({ currentPin, newPin }) });
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setPinMessage({ tone: "success", text: "Your PIN is changed. Use the new PIN next time you sign in." });
    } catch (err) {
      setPinMessage({ tone: "error", text: err instanceof Error ? err.message : "Couldn’t change your PIN" });
    } finally {
      setPinBusy("");
    }
  }

  async function resetPartnerPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPinMessage(null);
    if (partnerPin !== confirmPartnerPin) {
      setPinMessage({ tone: "error", text: "The partner PINs do not match." });
      return;
    }
    setPinBusy("partner");
    try {
      await api("/api/auth/pin/reset", { method: "PATCH", body: JSON.stringify({ profileId: partner?.id, newPin: partnerPin }) });
      setPartnerPin("");
      setConfirmPartnerPin("");
      setPinMessage({ tone: "success", text: `${partner?.name}'s PIN was reset. Share the new PIN with them privately.` });
    } catch (err) {
      setPinMessage({ tone: "error", text: err instanceof Error ? err.message : "Couldn’t reset that PIN" });
    } finally {
      setPinBusy("");
    }
  }

  function startTaskDrag(taskId: string, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    taskOrderRef.current = taskOrder?.length ? [...taskOrder] : [...serverTaskIds];
    setDraggingTaskId(taskId);
  }

  function moveTask(taskId: string, direction: -1 | 1) {
    const current = taskOrder?.length ? taskOrder : serverTaskIds;
    const from = current.indexOf(taskId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= current.length) return;
    const next = [...current];
    next.splice(to, 0, next.splice(from, 1)[0]);
    taskOrderRef.current = next;
    setTaskOrder(next);
    void persistTaskOrder(next);
  }

  if (!data || !me || !partner) return <main className="premium-loading">
    <div className="premium-loading-blobs" aria-hidden="true"><i /><i /><i /></div>
    <span className="premium-loading-heart"><Heart size={27} fill="currentColor" /></span>
    <div className="premium-loading-copy"><strong>two.</strong><p>{error || "Preparing your day…"}</p></div>
  </main>;

  const currentNow = now ?? Date.parse(data.generatedAt);
  const myTask = me.busy ? me.tasks.find((task) => task.id === me.busy!.taskId) ?? null : null;
  const partnerTask = partner.busy ? partner.tasks.find((task) => task.id === partner.busy!.taskId) ?? null : null;
  const timer = myTask ? countdownState(myTask, currentNow) : null;
  const partnerTimer = partnerTask ? countdownState(partnerTask, currentNow) : null;
  const plannedTask = myTask ? null : me.tasks
    .filter((task) => !task.completedAt)
    .map((task) => ({ task, schedule: scheduleState(task, currentNow) }))
    .sort((a, b) => {
      const priority = { now: 0, late: 1, upcoming: 2, anytime: 3 } as const;
      return priority[a.schedule.phase] - priority[b.schedule.phase] || a.schedule.timestamp - b.schedule.timestamp;
    })[0]?.task ?? null;
  const plannedSchedule = plannedTask ? scheduleState(plannedTask, currentNow) : null;
  const myKind = visualKind(myTask);
  const together = Boolean(myKind && partnerTask && myKind === visualKind(partnerTask) && (myKind === "study" || myKind === "cooking"));
  const displayedTask = myTask ?? plannedTask;
  const currentHour = new Date(currentNow).getHours();
  const isMorning = currentHour >= 5 && currentHour < 11;
  const focusAnimation = displayedTask
    ? lottieFor(displayedTask, me, together)
    : isMorning ? LOTTIES.sunrise : isKaveri(me) ? LOTTIES.natureFemale : LOTTIES.studyMale;
  const partnerAnimation = partnerTask ? lottieFor(partnerTask, partner, false) : null;
  const progress = myTask && timer && myTask.durationMinutes ? Math.min(100, Math.max(0, (timer.elapsedMinutes / myTask.durationMinutes) * 100)) : 0;
  const maxScore = Math.max(1, Math.abs(me.score), Math.abs(partner.score));
  const suggestion = suggestedKind(draftTitle, draftCategory);
  const suggestedAnimation = suggestion === "cooking"
    ? LOTTIES.cooking
    : suggestion === "study" ? isKaveri(me) ? LOTTIES.studyFemale : LOTTIES.studyMale
      : suggestion === "planning" ? isKaveri(me) ? LOTTIES.studyFemale : LOTTIES.studyMale : null;
  const focusStudy = me.focusMinutes.study + (myTask && (myTask.activeSession?.currentPause?.category ?? myTask.category) === "Study" ? Math.max(0, currentNow - Date.parse(data.generatedAt)) / 60000 : 0);
  const focusProductive = me.focusMinutes.productive + (myTask && (myTask.activeSession?.currentPause?.category ?? myTask.category) === "Productive" ? Math.max(0, currentNow - Date.parse(data.generatedAt)) / 60000 : 0);
  const weekdayName = new Intl.DateTimeFormat("en", { weekday: "long" }).format(new Date());
  const editWeekdayName = new Intl.DateTimeFormat("en", { weekday: "long" }).format(new Date(`${editDate}T12:00:00`));
  const taskOrderIndex = new Map((taskOrder ?? serverTaskIds).map((id, index) => [id, index]));
  const plannerTasks = [...me.tasks].sort((a, b) => (taskOrderIndex.get(a.id) ?? a.sortOrder) - (taskOrderIndex.get(b.id) ?? b.sortOrder));

  return <div className={`premium-app tab-${activeTab}`}>
    <aside className="premium-rail">
      <div className="premium-logo"><Heart size={19} fill="currentColor" /><span>two.</span></div>
      <nav aria-label="Main navigation">
        <button className={activeTab === "home" ? "active" : ""} onClick={() => setActiveTab("home")} aria-label="Focus"><Home size={19} /><span>Focus</span></button>
        <button className={activeTab === "tasks" ? "active" : ""} onClick={() => setActiveTab("tasks")} aria-label="Tasks"><CalendarDays size={19} /><span>Tasks</span></button>
        <button className={activeTab === "progress" ? "active" : ""} onClick={() => setActiveTab("progress")} aria-label="Progress"><BarChart3 size={19} /><span>Progress</span></button>
        <button className={activeTab === "activity" ? "active" : ""} onClick={() => setActiveTab("activity")} aria-label="Activity"><Clock3 size={19} /><span>Activity</span></button>
      </nav>
      <button className="premium-profile-button" onClick={() => setSettingsOpen(true)} aria-label="Open profile settings"><span className={me.accent}>{me.avatar}</span><KeyRound size={15} /></button>
    </aside>

    <main className="premium-page">
      <header className="premium-topbar">
        <div className="premium-top-identity"><span className="premium-mobile-logo"><Heart size={16} fill="currentColor" /> <b>two.</b></span></div>
        <div className="premium-top-actions">
          <span className="premium-score-pill"><Flame size={15} fill="currentColor" /> {formatPoints(me.score)} pts</span>
          <button onClick={() => setAddOpen(true)}><Plus size={16} /> New task</button>
          <button className="premium-user" onClick={() => setSettingsOpen(true)} aria-label={`Open ${me.name}'s profile settings`}><span className={me.accent}>{me.avatar}</span><b>{me.name}</b></button>
        </div>
      </header>

      {error && <div className="premium-error" role="alert">{error}<button onClick={() => setError("")}><X size={14} /></button></div>}

      <section className="premium-workspace" id="focus">
        <div className="premium-focus-column">
          <section className={`premium-focus-stage ${myTask ? "is-running" : "is-idle"} ${timer?.paused ? "is-paused" : ""} ${timer?.overtime ? "is-overtime" : ""}`}>
            <div className="premium-stage-head">
              <div>
                {(myTask || plannedTask) && <span className="premium-kicker">{myTask ? timer?.paused ? "SESSION PAUSED" : "IN FOCUS" : plannedSchedule?.phase === "now" ? "PLANNED RIGHT NOW" : plannedSchedule?.phase === "late" ? "NEEDS YOUR ATTENTION" : "UP NEXT"}</span>}
                <h1>{myTask ? myTask.title : plannedTask ? plannedTask.title : <>Ready when you are,<br /><span>{me.name}.</span></>}</h1>
                {!myTask && !plannedTask && <div className="premium-stage-datetime"><span><CalendarDays size={13} /> {new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long" }).format(new Date(currentNow))}</span><span><Clock3 size={13} /> {formatCurrentClock(currentNow)}</span></div>}
              </div>
              {(myTask ?? plannedTask) && <span className={`premium-category-chip ${categorySlug((myTask ?? plannedTask)!.category)}`}><CategoryIcon category={(myTask ?? plannedTask)!.category} size={14} /> {(myTask ?? plannedTask)!.category}</span>}
            </div>

            {together && <div className="premium-together-pill"><Users size={14} /><span><b>You’re doing this together</b>{partner.name} is focused on {partnerTask?.title}</span><div><span className={`premium-avatar ${me.accent}`}>{me.avatar}</span><span className={`premium-avatar ${partner.accent}`}>{partner.avatar}</span></div></div>}

            {partnerTask && partnerTimer && <aside className={`premium-partner-focus accent-${partner.accent} ${partnerTimer.paused ? "is-paused" : ""}`} aria-label={`${partner.name} is working on ${partnerTask.title}`}>
              <div className="premium-partner-focus-visual">
                {partnerAnimation ? <LottieMotion src={partnerAnimation} paused={partnerTimer.paused} /> : <span className={`premium-fallback-mini ${categorySlug(partnerTask.category)}`}><CategoryIcon category={partnerTask.category} size={26} /></span>}
              </div>
              <div className="premium-partner-focus-copy">
                <span><i /> {partnerTimer.paused ? "PARTNER PAUSED" : "PARTNER IN FOCUS"}</span>
                <strong>{partner.name}</strong>
                <p>{partnerTask.title}</p>
                <small><CategoryIcon category={partnerTask.category} size={10} /> {partnerTask.category}</small>
              </div>
              <b className={partnerTimer.overtime ? "is-overtime" : ""}>{partnerTimer.label}</b>
            </aside>}

            <div className="premium-focus-center">
              <div className="premium-focus-orb" style={{ "--focus-progress": `${progress * 3.6}deg` } as CSSProperties}>
                <div className="premium-focus-orb-inner">
                  {focusAnimation ? <LottieMotion src={focusAnimation} paused={Boolean(timer?.paused)} cover={!displayedTask && (isMorning || isKaveri(me))} loop={focusAnimation !== LOTTIES.sunrise} className={!displayedTask ? isMorning ? "is-idle-sunrise" : isKaveri(me) ? "is-idle-nature" : "" : ""} /> : <div className={`premium-fallback ${displayedTask ? categorySlug(displayedTask.category) : "study"}`}><span><CategoryIcon category={displayedTask?.category ?? "Study"} size={54} /></span><i /><i /><i /></div>}
                </div>
                <div className="premium-time-float">
                  <strong>{timer?.label ?? formatCurrentClock(currentNow)}</strong>
                  <small>{timer ? timer.overtime ? "OVERTIME" : timer.paused ? `${timer.pauseCategory} PAUSE` : "REMAINING" : plannedSchedule ? `${plannedSchedule.label} · ${plannedSchedule.detail}` : "CURRENT TIME"}</small>
                </div>
              </div>
            </div>

            {myTask && timer ? <div className="premium-focus-footer">
              <div className="premium-session-meta"><span><Timer size={14} /> {myTask.durationMinutes} min goal</span><span><Flame size={14} /> {timer.livePoints > 0 ? "+" : ""}{formatPoints(timer.livePoints)} live points</span>{timer.paused && <span><Clock3 size={14} /> {timer.pauseElapsed} paused</span>}</div>
              <div className="premium-focus-actions">
                {timer.paused ? <button className="premium-resume" onClick={() => taskAction(myTask, "resume")}><Play size={16} fill="currentColor" /> Resume</button> : <button className="premium-pause" onClick={() => setPauseTask(myTask)}><Pause size={16} fill="currentColor" /> Pause</button>}
                <button className="premium-finish" onClick={() => taskAction(myTask, "finish")}><Check size={17} strokeWidth={3} /> Finish session</button>
              </div>
            </div> : <div className="premium-idle-footer">{plannedTask ? <><p><Clock3 size={14} /> {plannedTask.scheduledTime ? `${plannedSchedule?.detail}. Planned for ${formatClockTime(plannedTask.scheduledTime)}.` : "Ready whenever you are. Start it when you want."}</p><button onClick={() => taskAction(plannedTask, plannedTask.durationMinutes > 0 ? "start" : "toggle")} disabled={Boolean(busyId)}><Play size={16} fill="currentColor" /> {plannedTask.durationMinutes > 0 ? "Start now" : "Complete task"}</button></> : <><p>Your day is clear. Add a task and start whenever you&apos;re ready.</p><button onClick={() => setAddOpen(true)}><Plus size={16} /> Plan a focus session</button></>}</div>}
          </section>

          <div className="premium-tab-heading premium-progress-heading"><span className="premium-kicker">YOUR MOMENTUM</span><h1>Progress that feels alive.</h1><p>A clean view of your time, consistency, and shared score this week.</p></div>
          <section className="premium-insights" id="progress">
            <article><span className="premium-insight-icon study"><BookOpen size={18} /></span><div><small>STUDY TODAY</small><strong>{formatFocusTime(focusStudy)}</strong></div><span className="premium-trend">2 pts/min</span></article>
            <article><span className="premium-insight-icon productive"><Briefcase size={18} /></span><div><small>PRODUCTIVE</small><strong>{formatFocusTime(focusProductive)}</strong></div><span className="premium-trend">2 pts/min</span></article>
            <article className="premium-couple-score"><span className="premium-insight-icon score"><Trophy size={18} /></span><div><small>THIS WEEK</small><strong>{formatPoints(me.score + partner.score)} pts</strong></div><div className="premium-duo"><span className={me.accent}>{me.avatar}</span><span className={partner.accent}>{partner.avatar}</span></div></article>
          </section>
        </div>

        <aside className="premium-day-panel">
          <div className="premium-day-head"><div><span className="premium-kicker">TODAY</span><h2>Your rhythm</h2></div><div className="premium-day-controls"><button type="button" className="premium-clear-tasks" onClick={() => setDeleteTarget("all")} disabled={!plannerTasks.length || Boolean(me.busy)} aria-label="Clear all my tasks"><Trash2 size={13} /><span>Clear</span></button><MiniProgress done={me.todayCompleted} total={me.totalToday} /></div></div>

          <div className={`premium-partner-status ${partnerTask ? "is-busy" : ""}`}>
            <span className={`premium-avatar ${partner.accent}`}>{partner.avatar}<i /></span>
            <div><strong>{partner.name}</strong><small>{partnerTask ? partnerTimer?.paused ? `Paused · ${partnerTimer.pauseCategory}` : `Focusing · ${partnerTask.title}` : "Free right now"}</small></div>
            {partnerTask && <b>{partnerTimer?.label}</b>}
          </div>

          <div className="premium-planner-hint"><span><GripVertical size={12} /> Drag to reorder</span><span><CalendarClock size={12} /> Tap timing to schedule</span></div>

          <div className="premium-task-list">
            {plannerTasks.length ? plannerTasks.map((task, index) => <QueueTask key={task.id} task={task} busy={Boolean(me.busy || busyId)} now={currentNow} dragging={draggingTaskId === task.id} isFirst={index === 0} isLast={index === plannerTasks.length - 1} onAction={taskAction} onPause={setPauseTask} onEdit={openEditTask} onDragStart={startTaskDrag} onMove={moveTask} />) : <div className="premium-empty"><Sparkles size={22} /><strong>Your day is open</strong><p>Add a task and make the first move.</p></div>}
          </div>
          <button className="premium-add-row" onClick={() => setAddOpen(true)}><Plus size={15} /> Add to today</button>

          <section className="premium-race-card">
            <div><span className="premium-kicker">WEEKLY RACE</span><Trophy size={16} /></div>
            <h3>{winner ? `${winner.name} leads by ${formatPoints(Math.abs(me.score - partner.score))}` : "Perfectly level"}</h3>
            {[me, partner].map((profile) => <div className="premium-race-row" key={profile.id}><span className={`premium-avatar ${profile.accent}`}>{profile.avatar}{winner?.id === profile.id && <i><Crown size={8} fill="currentColor" /></i>}</span><div><p><b>{profile.name}</b><strong>{formatPoints(profile.score)}</strong></p><span><i style={{ width: `${Math.max(4, Math.abs(profile.score) / maxScore * 100)}%` }} /></span></div></div>)}
          </section>
        </aside>
      </section>

      <section className="premium-activity" id="activity">
        <div className="premium-section-title"><div><span className="premium-kicker">SHARED MOMENTUM</span><h2>Recent wins</h2></div><Heart size={18} fill="currentColor" /></div>
        <div className="premium-activity-grid">{data.recentActivity.length ? data.recentActivity.slice(0, 4).map((activity) => {
          const owner = data.profiles.find((profile) => profile.id === activity.profile_id)!;
          return <article key={activity.id}><span className={`premium-avatar ${owner.accent}`}>{owner.avatar}</span><div><strong>{activity.task_title}</strong><small>{activity.profile_name} · {new Date(activity.completed_at).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}</small></div><b className={activity.points_earned < 0 ? "negative" : ""}>{activity.points_earned > 0 ? "+" : ""}{formatPoints(activity.points_earned)}</b></article>;
        }) : <p className="premium-no-activity">Complete a task and your shared momentum will begin here.</p>}</div>
      </section>
    </main>

    {completeToast && <div className="premium-complete-toast" role="status"><span><CircleCheck size={20} /></span><div><strong>Beautiful work.</strong><small>{completeToast} completed</small></div></div>}
    {plannerToast && <div className="premium-planner-toast" role="status"><span><CircleCheck size={18} /></span><div><strong>Planner updated</strong><small>{plannerToast}</small></div></div>}

    {settingsOpen && <div className="premium-modal-backdrop premium-settings-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") closeSettings(); }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeSettings(); }}>
      <section className="premium-modal premium-settings-modal" role="dialog" aria-modal="true" aria-labelledby="premium-settings-title">
        <button type="button" className="premium-modal-close" onClick={closeSettings} aria-label="Close profile settings"><X size={17} /></button>
        <div className="premium-settings-identity">
          <span className={`premium-settings-avatar ${me.accent}`}>{me.avatar}</span>
          <div><span className="premium-kicker">PRIVATE PROFILE</span><h2 id="premium-settings-title">{me.name}&apos;s settings</h2><p>Manage only your sign-in and profile session.</p></div>
        </div>

        {pinMessage && <div className={`premium-pin-message is-${pinMessage.tone}`} role={pinMessage.tone === "error" ? "alert" : "status"}>{pinMessage.tone === "success" ? <CircleCheck size={15} /> : <AlertTriangle size={15} />}<span>{pinMessage.text}</span></div>}

        <form className="premium-pin-section" onSubmit={changeOwnPin}>
          <div className="premium-pin-heading"><span><KeyRound size={16} /></span><div><strong>Change my PIN</strong><small>Confirm your current PIN, then choose 4–8 new digits.</small></div></div>
          <div className="premium-pin-grid">
            <label className="premium-field">Current PIN<input type="password" inputMode="numeric" autoComplete="current-password" value={currentPin} onChange={(event) => setCurrentPin(event.target.value)} minLength={4} maxLength={8} pattern="[0-9]+" placeholder="••••" required /></label>
            <label className="premium-field">New PIN<input type="password" inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(event) => setNewPin(event.target.value)} minLength={4} maxLength={8} pattern="[0-9]+" placeholder="4–8 digits" required /></label>
            <label className="premium-field">Confirm new PIN<input type="password" inputMode="numeric" autoComplete="new-password" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value)} minLength={4} maxLength={8} pattern="[0-9]+" placeholder="Repeat PIN" required /></label>
          </div>
          <button className="premium-pin-submit" disabled={Boolean(pinBusy)}>{pinBusy === "self" ? "Changing…" : "Change my PIN"}<ChevronRight size={15} /></button>
        </form>

        {data.isInitializer && <form className="premium-pin-section premium-owner-section" onSubmit={resetPartnerPin}>
          <div className="premium-pin-heading"><span><LockKeyhole size={16} /></span><div><strong>Reset {partner.name}&apos;s PIN</strong><small>Setup-owner recovery. The old PIN cannot be displayed, but you can replace it.</small></div></div>
          <div className="premium-pin-grid is-partner">
            <label className="premium-field">New PIN for {partner.name}<input type="password" inputMode="numeric" autoComplete="new-password" value={partnerPin} onChange={(event) => setPartnerPin(event.target.value)} minLength={4} maxLength={8} pattern="[0-9]+" placeholder="4–8 digits" required /></label>
            <label className="premium-field">Confirm partner PIN<input type="password" inputMode="numeric" autoComplete="new-password" value={confirmPartnerPin} onChange={(event) => setConfirmPartnerPin(event.target.value)} minLength={4} maxLength={8} pattern="[0-9]+" placeholder="Repeat PIN" required /></label>
          </div>
          <p className="premium-pin-safety"><LockKeyhole size={11} /> Resetting signs {partner.name} out on any other device. Their tasks and progress are untouched.</p>
          <button className="premium-pin-submit is-secondary" disabled={Boolean(pinBusy)}>{pinBusy === "partner" ? "Resetting…" : `Set ${partner.name}'s new PIN`}<ChevronRight size={15} /></button>
        </form>}

        <button type="button" className="premium-switch-profile" onClick={onLogout}><LogOut size={14} /> Switch profile</button>
      </section>
    </div>}

    {addOpen && <div className="premium-modal-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") closeAddTask(); }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeAddTask(); }}>
      <form className="premium-modal premium-task-modal" onSubmit={addTask}>
        <div className="premium-task-modal-bar">
          <button type="button" className="premium-modal-close" onClick={closeAddTask} aria-label="Close"><X size={17} /></button>
          <div><small>NEW TASK</small><strong>Plan your day</strong></div>
          <button className="premium-create-button premium-create-button-top" disabled={busyId === "new"}>{busyId === "new" ? "Adding…" : "Add to my day"}<ChevronRight size={16} /></button>
        </div>
        <div className="premium-modal-title"><span><Plus size={17} /></span><div><p>CREATE A TASK</p><h2>What will move your day forward?</h2></div></div>
        <label className="premium-field">Task name<input name="title" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Study calculus, cook dinner…" maxLength={80} required /></label>
        <label className="premium-field">Category<select name="category" value={draftCategory} onChange={(event) => setDraftCategory(event.target.value as TaskCategory)}>{TASK_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>

        <fieldset className="premium-start-mode"><legend>Start</legend><input name="scheduledTime" type="hidden" value={draftScheduled ? draftTime : ""} />
          <button type="button" className={!draftScheduled ? "selected" : ""} onClick={() => setDraftScheduled(false)} aria-pressed={!draftScheduled}><Play size={16} /><span><strong>Start anytime</strong><small>Begins when you tap Start</small></span>{!draftScheduled && <Check size={14} />}</button>
          <button type="button" className={draftScheduled ? "selected" : ""} onClick={() => setDraftScheduled(true)} aria-pressed={draftScheduled}><CalendarClock size={16} /><span><strong>Scheduled</strong><small>Set a planned start time</small></span>{draftScheduled && <Check size={14} />}</button>
        </fieldset>

        {draftScheduled && <label className="premium-field premium-native-time-field">Start time<input type="time" value={draftTime} onChange={(event) => setDraftTime(event.target.value)} required /></label>}

        <DurationPicker value={draftDuration} onChange={setDraftDuration} />

        <div className="premium-time-note"><Clock3 size={15} /><span><strong>{draftScheduled ? `Scheduled for ${formatClockTime(draftTime)}` : "Starts when you tap Start"}</strong><small>{draftScheduled ? "It will be highlighted when the planned time arrives." : "No clock time is required."}</small></span></div>

        <fieldset className="premium-schedule"><legend>Repeat</legend><input type="hidden" name="scheduleType" value={draftSchedule} /><input type="hidden" name="dateKey" value={todayKey()} />
          {([
            ["once", "Today", "One time", CalendarDays],
            ["daily", "Every day", "7 days", Repeat2],
            ["weekdays", "Weekdays", "Mon–Fri", Briefcase],
            ["weekly", "Weekly", `Every ${weekdayName}`, CalendarDays],
          ] as const).map(([value, label, detail, Icon]) => <button type="button" key={value} className={draftSchedule === value ? "selected" : ""} onClick={() => setDraftSchedule(value)} aria-pressed={draftSchedule === value}><Icon size={15} /><span><strong>{label}</strong><small>{detail}</small></span>{draftSchedule === value && <Check size={13} />}</button>)}
        </fieldset>

        <div className="premium-animation-match">
          <div className="premium-animation-preview">{suggestedAnimation ? <LottieMotion src={suggestedAnimation} /> : <span className={`premium-fallback-mini ${categorySlug(draftCategory)}`}><CategoryIcon category={draftCategory} size={27} /></span>}</div>
          <div><span><Sparkles size={12} /> SMART ANIMATION</span><strong>{suggestion ? `${suggestion[0].toUpperCase()}${suggestion.slice(1)} matched` : "Calm focus matched"}</strong><p>Chosen automatically from your task name. Add more Lotties anytime to grow the library.</p></div>
        </div>
      </form>
    </div>}

    {editTask && <div className="premium-modal-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") closeEditTask(); }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditTask(); }}>
      <form className="premium-modal premium-task-modal premium-edit-modal" onSubmit={updateTask}>
        <div className="premium-task-modal-bar">
          <button type="button" className="premium-modal-close" onClick={closeEditTask} aria-label="Close"><X size={17} /></button>
          <div><small>EDIT TASK</small><strong>Update your plan</strong></div>
          <button className="premium-create-button premium-create-button-top" disabled={busyId === `edit-${editTask.id}`}>{busyId === `edit-${editTask.id}` ? "Saving…" : "Save changes"}<Check size={16} /></button>
        </div>
        <div className="premium-modal-title"><span><CalendarClock size={17} /></span><div><p>FLEXIBLE PLANNING</p><h2>Make this task fit your day.</h2></div></div>
        <label className="premium-field">Task name<input name="title" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={80} required /></label>
        <label className="premium-field">Category<select name="category" value={editCategory} onChange={(event) => setEditCategory(event.target.value as TaskCategory)}>{TASK_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>

        <fieldset className="premium-start-mode"><legend>Start</legend><input name="scheduledTime" type="hidden" value={editScheduled ? editTime : ""} />
          <button type="button" className={!editScheduled ? "selected" : ""} onClick={() => setEditScheduled(false)} aria-pressed={!editScheduled}><Play size={16} /><span><strong>Start anytime</strong><small>Begins when you tap Start</small></span>{!editScheduled && <Check size={14} />}</button>
          <button type="button" className={editScheduled ? "selected" : ""} onClick={() => setEditScheduled(true)} aria-pressed={editScheduled}><CalendarClock size={16} /><span><strong>Scheduled</strong><small>Set a planned start time</small></span>{editScheduled && <Check size={14} />}</button>
        </fieldset>

        {editScheduled && <label className="premium-field premium-native-time-field">Start time<input type="time" value={editTime} onChange={(event) => setEditTime(event.target.value)} required /></label>}

        <DurationPicker value={editDuration} onChange={setEditDuration} />

        <div className="premium-time-note premium-reschedule-note"><CalendarClock size={15} /><span><strong>{editScheduled ? `Scheduled for ${formatClockTime(editTime)}` : "Starts when you tap Start"}</strong><small>{editScheduled ? "The task will be highlighted around this time." : "This task has no fixed start time."}</small></span></div>

        <fieldset className="premium-schedule"><legend>Repeat</legend><input type="hidden" name="scheduleType" value={editSchedule} />
          {([
            ["once", "One day", "Choose date", CalendarDays],
            ["daily", "Every day", "7 days", Repeat2],
            ["weekdays", "Weekdays", "Mon–Fri", Briefcase],
            ["weekly", "Weekly", `Every ${editWeekdayName}`, CalendarDays],
          ] as const).map(([value, label, detail, Icon]) => <button type="button" key={value} className={editSchedule === value ? "selected" : ""} onClick={() => setEditSchedule(value)} aria-pressed={editSchedule === value}><Icon size={15} /><span><strong>{label}</strong><small>{detail}</small></span>{editSchedule === value && <Check size={13} />}</button>)}
        </fieldset>

        <label className={`premium-field premium-date-field ${editSchedule === "once" ? "is-visible" : ""}`}>Scheduled date<input name="dateKey" type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} required /></label>
        <div className="premium-edit-footer"><p className="premium-edit-note"><LockKeyhole size={12} /> Previous completions, tracked minutes, and points stay unchanged.</p><button type="button" className="premium-delete-task" onClick={() => setDeleteTarget(editTask)}><Trash2 size={13} /> Delete task</button></div>
      </form>
    </div>}

    {deleteTarget && <div className="premium-modal-backdrop premium-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}>
      <section className="premium-modal premium-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="premium-delete-title">
        <span className="premium-confirm-icon"><AlertTriangle size={22} /></span>
        <span className="premium-kicker">PLEASE CONFIRM</span>
        <h2 id="premium-delete-title">{deleteTarget === "all" ? "Clear all your tasks?" : `Delete “${deleteTarget.title}”?`}</h2>
        <p>{deleteTarget === "all" ? "This removes every task from your planner. Kaveri’s tasks are not affected." : "This removes the task from your planner."} Your previous scores and activity history will stay safe.</p>
        <div className="premium-confirm-actions"><button type="button" onClick={() => setDeleteTarget(null)}>Keep tasks</button><button type="button" className="danger" onClick={() => void removeTasks()} disabled={busyId.startsWith("delete-")}><Trash2 size={14} /> {busyId.startsWith("delete-") ? "Removing…" : deleteTarget === "all" ? "Clear my tasks" : "Delete task"}</button></div>
      </section>
    </div>}

    {pauseTask && <div className="premium-modal-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") setPauseTask(null); }} onMouseDown={(event) => { if (event.target === event.currentTarget) setPauseTask(null); }}>
      <section className="premium-modal premium-pause-modal" role="dialog" aria-modal="true" aria-labelledby="premium-pause-title">
        <button type="button" className="premium-modal-close" onClick={() => setPauseTask(null)} aria-label="Close"><X size={17} /></button>
        <div className="premium-modal-title"><span><Pause size={17} /></span><div><p>PAUSE TRACKING</p><h2 id="premium-pause-title">What are you switching to?</h2></div></div>
        <p className="premium-modal-copy">{pauseTask.title} will freeze while the selected pause is tracked separately.</p>
        <div className="premium-pause-grid">{TASK_CATEGORIES.filter((category) => category !== pauseTask.category).map((category) => <button key={category} className={categorySlug(category)} onClick={() => pauseFor(category)} disabled={busyId === pauseTask.id}><span><CategoryIcon category={category} size={19} /></span><strong>{category}</strong><small>{category === "Entertainment" ? "−0.5 pts/min" : category === "Daily essentials" ? "1 pt/min" : "2 pts/min"}</small></button>)}</div>
        <p className="premium-lock-note"><LockKeyhole size={11} /> Your original task remains protected and resumes exactly where it stopped.</p>
      </section>
    </div>}
  </div>;
}
