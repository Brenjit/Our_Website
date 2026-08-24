"use client";

import type { AnimationItem } from "lottie-web";
import lottie from "lottie-web";
import {
  BarChart3,
  BookOpen,
  Briefcase,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clapperboard,
  Clock3,
  Coffee,
  Crown,
  Flame,
  Heart,
  Home,
  LockKeyhole,
  LogOut,
  Pause,
  Play,
  Plus,
  Repeat2,
  Sparkles,
  Square,
  Timer,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type TaskCategory = "Study" | "Productive" | "Entertainment" | "Daily essentials";
type TaskSchedule = "once" | "daily" | "weekdays" | "weekly";
const TASK_CATEGORIES: TaskCategory[] = ["Study", "Productive", "Entertainment", "Daily essentials"];

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

const LOTTIES = {
  studyMale: "/Lotties/study%20planning.json",
  studyFemale: "/Lotties/Study.json",
  studyTogether: "/Lotties/Study%20discussion%20both.json",
  cooking: "/Lotties/Cooking.json",
  cookingTogether: "/Lotties/cooking%20together.json",
  natureFemale: "/Lotties/Reading%20in%20nature%20GIRL%20(default).json",
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

function timeParts(value: string) {
  const safeValue = /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "09:00";
  const [hour24, minute] = safeValue.split(":").map(Number);
  return {
    hour12: hour24 % 12 || 12,
    minute,
    period: hour24 >= 12 ? "PM" as const : "AM" as const,
  };
}

function timeValue(hour12: number, minute: number, period: "AM" | "PM") {
  const hour24 = (hour12 % 12) + (period === "PM" ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function TimeWheel({ label, values, selected, onSelect }: {
  label: string;
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const list = listRef.current;
    const selectedButton = list?.querySelector<HTMLElement>("[aria-selected='true']");
    if (list && selectedButton) list.scrollTo({ top: selectedButton.offsetTop - list.clientHeight / 2 + selectedButton.clientHeight / 2, behavior: "smooth" });
  }, [selected]);
  useEffect(() => () => { if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current); }, []);
  function handleScroll() {
    if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(() => {
      const list = listRef.current;
      if (!list) return;
      const center = list.scrollTop + list.clientHeight / 2;
      const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>("[data-time-value]"));
      const nearest = buttons.reduce<HTMLButtonElement | null>((closest, button) => {
        if (!closest) return button;
        const buttonCenter = button.offsetTop + button.clientHeight / 2;
        const closestCenter = closest.offsetTop + closest.clientHeight / 2;
        return Math.abs(buttonCenter - center) < Math.abs(closestCenter - center) ? button : closest;
      }, null);
      const nextValue = nearest?.dataset.timeValue;
      if (nextValue && nextValue !== selected) onSelect(nextValue);
    }, 110);
  }
  return <div className="premium-time-wheel"><span>{label}</span><div ref={listRef} role="listbox" aria-label={label} onScroll={handleScroll}>
    {values.map((value) => <button type="button" role="option" data-time-value={value} aria-selected={selected === value} key={value} onClick={() => onSelect(value)}>{value}</button>)}
  </div></div>;
}

function TimePicker({ value, onChange, onClose }: { value: string; onChange: (value: string) => void; onClose: () => void }) {
  const [pickerMode, setPickerMode] = useState<"dial" | "wheels">("dial");
  const [dialFace, setDialFace] = useState<"hour" | "minute">("hour");
  const { hour12, minute, period } = timeParts(value);
  const dialValues = dialFace === "hour" ? Array.from({ length: 12 }, (_, index) => index + 1) : Array.from({ length: 12 }, (_, index) => index * 5);
  const selectedDialValue = dialFace === "hour" ? hour12 : Math.round(minute / 5) * 5 % 60;
  const handAngle = dialFace === "hour" ? hour12 * 30 : minute * 6;
  const update = (next: Partial<{ hour12: number; minute: number; period: "AM" | "PM" }>) => onChange(timeValue(next.hour12 ?? hour12, next.minute ?? minute, next.period ?? period));

  return <section className="premium-time-picker" role="dialog" aria-label="Choose task start time">
    <header>
      <div><small>START TIME</small><strong>{formatClockTime(value)}</strong></div>
      <div className="premium-time-period" aria-label="AM or PM">
        {(["AM", "PM"] as const).map((choice) => <button type="button" key={choice} className={period === choice ? "selected" : ""} onClick={() => update({ period: choice })}>{choice}</button>)}
      </div>
    </header>
    <div className="premium-picker-tabs" role="tablist" aria-label="Time input style">
      <button type="button" role="tab" aria-selected={pickerMode === "dial"} onClick={() => setPickerMode("dial")}><Clock3 size={13} /> Clock</button>
      <button type="button" role="tab" aria-selected={pickerMode === "wheels"} onClick={() => setPickerMode("wheels")}><Repeat2 size={13} /> Scroll</button>
    </div>

    {pickerMode === "dial" ? <div className="premium-clock-picker">
      <div className="premium-clock-faces">
        <button type="button" className={dialFace === "hour" ? "active" : ""} onClick={() => setDialFace("hour")}>{String(hour12).padStart(2, "0")}</button><span>:</span><button type="button" className={dialFace === "minute" ? "active" : ""} onClick={() => setDialFace("minute")}>{String(minute).padStart(2, "0")}</button>
      </div>
      <div className="premium-clock-dial" style={{ "--clock-hand": `${handAngle}deg` } as CSSProperties}>
        <span className="premium-clock-hand" />
        <i className="premium-clock-pin" />
        {dialValues.map((number, index) => {
          const angle = index * 30 * Math.PI / 180;
          return <button
            type="button"
            key={number}
            className={selectedDialValue === number ? "selected" : ""}
            style={{ left: `${50 + Math.sin(angle) * 38}%`, top: `${50 - Math.cos(angle) * 38}%` }}
            onClick={() => {
              if (dialFace === "hour") { update({ hour12: number }); setDialFace("minute"); }
              else update({ minute: number });
            }}
          >{dialFace === "minute" ? String(number).padStart(2, "0") : number}</button>;
        })}
      </div>
    </div> : <div className="premium-time-wheels">
      <TimeWheel label="Hour" values={Array.from({ length: 12 }, (_, index) => String(index + 1))} selected={String(hour12)} onSelect={(next) => update({ hour12: Number(next) })} />
      <TimeWheel label="Minute" values={Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"))} selected={String(minute).padStart(2, "0")} onSelect={(next) => update({ minute: Number(next) })} />
      <TimeWheel label="Period" values={["AM", "PM"]} selected={period} onSelect={(next) => update({ period: next as "AM" | "PM" })} />
    </div>}
    <footer><span><Clock3 size={13} /> Local time</span><button type="button" onClick={onClose}><Check size={14} /> Done</button></footer>
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

function lottieFor(task: Task | null | undefined, profile: PublicProfile, together: boolean) {
  const kind = visualKind(task);
  if (kind === "cooking") return together ? LOTTIES.cookingTogether : LOTTIES.cooking;
  if (kind === "study") return together ? LOTTIES.studyTogether : profile.accent === "coral" ? LOTTIES.studyFemale : LOTTIES.studyMale;
  if (kind === "planning") return LOTTIES.studyMale;
  return null;
}

function LottieMotion({ src, paused = false, className = "" }: { src: string; paused?: boolean; className?: string }) {
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
      .then((animationData: object) => {
        if (controller.signal.aborted) return;
        const animation = lottie.loadAnimation({
          container,
          renderer: "svg",
          loop: true,
          autoplay: !paused,
          animationData,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
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
  }, [src, paused]);
  return <div className={`premium-lottie ${paused ? "is-paused" : ""} ${className}`}>
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

function QueueTask({ task, busy, now, onAction, onPause }: {
  task: Task;
  busy: boolean;
  now: number;
  onAction: (task: Task, action: "toggle" | "start" | "finish" | "resume") => void;
  onPause: (task: Task) => void;
}) {
  const active = Boolean(task.activeSession);
  const timed = task.durationMinutes > 0;
  const countdown = countdownState(task, now);
  const schedule = scheduleState(task, now);
  return <article className={`premium-task ${task.completedAt ? "is-done" : ""} ${active ? "is-active" : ""} schedule-${schedule.phase}`}>
    <button
      className={`premium-task-action ${categorySlug(task.category)}`}
      onClick={() => onAction(task, timed ? countdown?.paused ? "resume" : active ? "finish" : "start" : "toggle")}
      disabled={Boolean(task.completedAt && timed) || (timed && busy && !active)}
      aria-label={task.completedAt ? `${task.title} completed` : active ? `Finish ${task.title}` : `Start ${task.title}`}
    >
      {task.completedAt ? <Check size={17} strokeWidth={3} /> : countdown?.paused ? <Play size={14} fill="currentColor" /> : active ? <Square size={11} fill="currentColor" /> : <CategoryIcon category={task.category} size={16} />}
    </button>
    <div className="premium-task-copy">
      <strong>{task.title}</strong>
      <span><b>{task.category}</b> · {scheduleLabel(task.scheduleType)}{timed ? ` · ${task.durationMinutes} min` : ""}</span>
      {!task.completedAt && !active && <span className={`premium-task-schedule ${schedule.phase}`}><Clock3 size={9} /><b>{schedule.label}</b> · {schedule.detail}</span>}
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
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCategory, setDraftCategory] = useState<TaskCategory>("Study");
  const [draftSchedule, setDraftSchedule] = useState<TaskSchedule>("once");
  const [draftTime, setDraftTime] = useState(defaultScheduledTime);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"home" | "tasks" | "progress" | "activity">("home");

  const load = useCallback(async () => {
    try {
      const result = await api<DashboardData>(`/api/dashboard?date=${todayKey()}&from=${weekStartKey()}`);
      setData(result);
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
    if (!completeToast) return;
    const timer = window.setTimeout(() => setCompleteToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [completeToast]);

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
      await api(`/api/tasks/${task.id}/${action === "toggle" ? "complete" : action}`, { method: "POST", body: JSON.stringify({ date: todayKey() }) });
      if (action === "start" || action === "resume") setActiveTab("home");
      if (action === "finish" || (action === "toggle" && !task.completedAt)) setCompleteToast(task.title);
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
      setTimePickerOpen(false);
      setDraftTitle("");
      setDraftCategory("Study");
      setDraftSchedule("once");
      setDraftTime(defaultScheduledTime());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t add that routine");
    } finally {
      setBusyId("");
    }
  }

  function closeAddTask() {
    setTimePickerOpen(false);
    setAddOpen(false);
  }

  if (!data || !me || !partner) return <main className="premium-loading"><span><Heart size={25} fill="currentColor" /></span><p>{error || "Preparing your day…"}</p></main>;

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
  const focusAnimation = displayedTask
    ? lottieFor(displayedTask, me, together)
    : /kaveri/i.test(me.name) ? LOTTIES.natureFemale : LOTTIES.studyMale;
  const progress = myTask && timer && myTask.durationMinutes ? Math.min(100, Math.max(0, (timer.elapsedMinutes / myTask.durationMinutes) * 100)) : 0;
  const maxScore = Math.max(1, Math.abs(me.score), Math.abs(partner.score));
  const suggestion = suggestedKind(draftTitle, draftCategory);
  const suggestedAnimation = suggestion === "cooking"
    ? LOTTIES.cooking
    : suggestion === "study" ? me.accent === "coral" ? LOTTIES.studyFemale : LOTTIES.studyMale
      : suggestion === "planning" ? LOTTIES.studyMale : null;
  const focusStudy = me.focusMinutes.study + (myTask && (myTask.activeSession?.currentPause?.category ?? myTask.category) === "Study" ? Math.max(0, currentNow - Date.parse(data.generatedAt)) / 60000 : 0);
  const focusProductive = me.focusMinutes.productive + (myTask && (myTask.activeSession?.currentPause?.category ?? myTask.category) === "Productive" ? Math.max(0, currentNow - Date.parse(data.generatedAt)) / 60000 : 0);
  const weekdayName = new Intl.DateTimeFormat("en", { weekday: "long" }).format(new Date());

  return <div className={`premium-app tab-${activeTab}`}>
    <aside className="premium-rail">
      <div className="premium-logo"><Heart size={19} fill="currentColor" /><span>two.</span></div>
      <nav aria-label="Main navigation">
        <button className={activeTab === "home" ? "active" : ""} onClick={() => setActiveTab("home")} aria-label="Focus"><Home size={19} /><span>Focus</span></button>
        <button className={activeTab === "tasks" ? "active" : ""} onClick={() => setActiveTab("tasks")} aria-label="Tasks"><CalendarDays size={19} /><span>Tasks</span></button>
        <button className={activeTab === "progress" ? "active" : ""} onClick={() => setActiveTab("progress")} aria-label="Progress"><BarChart3 size={19} /><span>Progress</span></button>
        <button className={activeTab === "activity" ? "active" : ""} onClick={() => setActiveTab("activity")} aria-label="Activity"><Clock3 size={19} /><span>Activity</span></button>
      </nav>
      <button className="premium-profile-button" onClick={onLogout} aria-label="Switch profile"><span className={me.accent}>{me.avatar}</span><LogOut size={15} /></button>
    </aside>

    <main className="premium-page">
      <header className="premium-topbar">
        <div><span className="premium-mobile-logo"><Heart size={16} fill="currentColor" /> two.</span><p>{new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p></div>
        <div className="premium-top-actions">
          <span className="premium-score-pill"><Flame size={15} fill="currentColor" /> {formatPoints(me.score)} pts</span>
          <button onClick={() => setAddOpen(true)}><Plus size={16} /> New task</button>
          <button className="premium-user" onClick={onLogout}><span className={me.accent}>{me.avatar}</span><b>{me.name}</b></button>
        </div>
      </header>

      {error && <div className="premium-error" role="alert">{error}<button onClick={() => setError("")}><X size={14} /></button></div>}

      <section className="premium-workspace" id="focus">
        <div className="premium-focus-column">
          <section className={`premium-focus-stage ${myTask ? "is-running" : "is-idle"} ${timer?.paused ? "is-paused" : ""} ${timer?.overtime ? "is-overtime" : ""}`}>
            <div className="premium-stage-head">
              <div><span className="premium-kicker">{myTask ? timer?.paused ? "SESSION PAUSED" : "IN FOCUS" : plannedTask ? plannedSchedule?.phase === "now" ? "PLANNED RIGHT NOW" : plannedSchedule?.phase === "late" ? "NEEDS YOUR ATTENTION" : "UP NEXT" : "YOUR FOCUS SPACE"}</span><h1>{myTask ? myTask.title : plannedTask ? plannedTask.title : `Ready when you are, ${me.name}.`}</h1></div>
              {(myTask ?? plannedTask) && <span className={`premium-category-chip ${categorySlug((myTask ?? plannedTask)!.category)}`}><CategoryIcon category={(myTask ?? plannedTask)!.category} size={14} /> {(myTask ?? plannedTask)!.category}</span>}
            </div>

            {together && <div className="premium-together-pill"><Users size={14} /><span><b>You’re doing this together</b>{partner.name} is focused on {partnerTask?.title}</span><div><span className={`premium-avatar ${me.accent}`}>{me.avatar}</span><span className={`premium-avatar ${partner.accent}`}>{partner.avatar}</span></div></div>}

            <div className="premium-focus-center">
              <div className="premium-focus-orb" style={{ "--focus-progress": `${progress * 3.6}deg` } as CSSProperties}>
                <div className="premium-focus-orb-inner">
                  {focusAnimation ? <LottieMotion src={focusAnimation} paused={Boolean(timer?.paused)} className={!displayedTask && /kaveri/i.test(me.name) ? "is-idle-nature" : ""} /> : <div className={`premium-fallback ${displayedTask ? categorySlug(displayedTask.category) : "study"}`}><span><CategoryIcon category={displayedTask?.category ?? "Study"} size={54} /></span><i /><i /><i /></div>}
                  <div className="premium-time-float">
                    <strong>{timer?.label ?? formatCurrentClock(currentNow)}</strong>
                    <small>{timer ? timer.overtime ? "OVERTIME" : timer.paused ? `${timer.pauseCategory} PAUSE` : "REMAINING" : plannedSchedule ? `${plannedSchedule.label} · ${plannedSchedule.detail}` : "CURRENT TIME"}</small>
                  </div>
                </div>
              </div>
            </div>

            {myTask && timer ? <div className="premium-focus-footer">
              <div className="premium-session-meta"><span><Timer size={14} /> {myTask.durationMinutes} min goal</span><span><Flame size={14} /> {timer.livePoints > 0 ? "+" : ""}{formatPoints(timer.livePoints)} live points</span>{timer.paused && <span><Clock3 size={14} /> {timer.pauseElapsed} paused</span>}</div>
              <div className="premium-focus-actions">
                {timer.paused ? <button className="premium-resume" onClick={() => taskAction(myTask, "resume")}><Play size={16} fill="currentColor" /> Resume</button> : <button className="premium-pause" onClick={() => setPauseTask(myTask)}><Pause size={16} fill="currentColor" /> Pause</button>}
                <button className="premium-finish" onClick={() => taskAction(myTask, "finish")}><Check size={17} strokeWidth={3} /> Finish session</button>
              </div>
            </div> : <div className="premium-idle-footer">{plannedTask ? <><p><Clock3 size={14} /> {plannedSchedule?.detail}. Your planned start was {plannedTask.scheduledTime ? formatClockTime(plannedTask.scheduledTime) : "set for anytime"}.</p><button onClick={() => taskAction(plannedTask, plannedTask.durationMinutes > 0 ? "start" : "toggle")} disabled={Boolean(busyId)}><Play size={16} fill="currentColor" /> {plannedTask.durationMinutes > 0 ? "Start now" : "Complete task"}</button></> : <><p>Your day is clear. Add a task with a start time and it will appear here when it is due.</p><button onClick={() => setAddOpen(true)}><Plus size={16} /> Plan a focus session</button></>}</div>}
          </section>

          <div className="premium-tab-heading premium-progress-heading"><span className="premium-kicker">YOUR MOMENTUM</span><h1>Progress that feels alive.</h1><p>A clean view of your time, consistency, and shared score this week.</p></div>
          <section className="premium-insights" id="progress">
            <article><span className="premium-insight-icon study"><BookOpen size={18} /></span><div><small>STUDY TODAY</small><strong>{formatFocusTime(focusStudy)}</strong></div><span className="premium-trend">2 pts/min</span></article>
            <article><span className="premium-insight-icon productive"><Briefcase size={18} /></span><div><small>PRODUCTIVE</small><strong>{formatFocusTime(focusProductive)}</strong></div><span className="premium-trend">2 pts/min</span></article>
            <article className="premium-couple-score"><span className="premium-insight-icon score"><Trophy size={18} /></span><div><small>THIS WEEK</small><strong>{formatPoints(me.score + partner.score)} pts</strong></div><div className="premium-duo"><span className={me.accent}>{me.avatar}</span><span className={partner.accent}>{partner.avatar}</span></div></article>
          </section>
        </div>

        <aside className="premium-day-panel">
          <div className="premium-day-head"><div><span className="premium-kicker">TODAY</span><h2>Your rhythm</h2></div><MiniProgress done={me.todayCompleted} total={me.totalToday} /></div>

          <div className={`premium-partner-status ${partnerTask ? "is-busy" : ""}`}>
            <span className={`premium-avatar ${partner.accent}`}>{partner.avatar}<i /></span>
            <div><strong>{partner.name}</strong><small>{partnerTask ? partnerTimer?.paused ? `Paused · ${partnerTimer.pauseCategory}` : `Focusing · ${partnerTask.title}` : "Free right now"}</small></div>
            {partnerTask && <b>{partnerTimer?.label}</b>}
          </div>

          <div className="premium-task-list">
            {me.tasks.length ? me.tasks.map((task) => <QueueTask key={task.id} task={task} busy={Boolean(me.busy || busyId)} now={currentNow} onAction={taskAction} onPause={setPauseTask} />) : <div className="premium-empty"><Sparkles size={22} /><strong>Your day is open</strong><p>Add a task and make the first move.</p></div>}
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

    {addOpen && <div className="premium-modal-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === "Escape") closeAddTask(); }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeAddTask(); }}>
      <form className="premium-modal premium-task-modal" onSubmit={addTask}>
        <div className="premium-task-modal-bar">
          <button type="button" className="premium-modal-close" onClick={closeAddTask} aria-label="Close"><X size={17} /></button>
          <div><small>NEW TASK</small><strong>Plan your day</strong></div>
          <button className="premium-create-button premium-create-button-top" disabled={busyId === "new"}>{busyId === "new" ? "Adding…" : "Add to my day"}<ChevronRight size={16} /></button>
        </div>
        <div className="premium-modal-title"><span><Plus size={17} /></span><div><p>CREATE A TASK</p><h2>What will move your day forward?</h2></div></div>
        <label className="premium-field">Task name<input name="title" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Study calculus, cook dinner…" maxLength={80} required /></label>
        <div className="premium-form-grid">
          <label className="premium-field">Category<select name="category" value={draftCategory} onChange={(event) => setDraftCategory(event.target.value as TaskCategory)}>{TASK_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="premium-field">Focus duration<input name="durationMinutes" type="number" min="0" max="240" defaultValue="25" /><span>minutes</span></label>
          <div className="premium-field"><b className="premium-field-name">Start time</b><input name="scheduledTime" type="hidden" value={draftTime} /><button className="premium-time-trigger" type="button" onClick={() => setTimePickerOpen((open) => !open)} aria-expanded={timePickerOpen}><Clock3 size={15} /><span>{formatClockTime(draftTime)}</span><ChevronDown size={14} /></button></div>
        </div>

        {timePickerOpen && <TimePicker value={draftTime} onChange={setDraftTime} onClose={() => setTimePickerOpen(false)} />}

        <div className="premium-time-note"><Clock3 size={15} /><span><strong>Scheduled for {formatClockTime(draftTime)}</strong><small>The live dashboard will mark this upcoming, happening now, or late using your current local time.</small></span></div>

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
