import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeAlarmStatus = {
  native: boolean;
  notificationsGranted: boolean;
  exactAlarmGranted: boolean;
  fullScreenGranted: boolean;
  scheduled: boolean;
  id?: string;
  title?: string;
  triggerAt?: number;
  openedSettings?: boolean;
  exact?: boolean;
};

export type NativeAlarmAction = {
  actionId: string;
  activityId: string;
  action: "stop" | "snooze";
  createdAt: number;
};

type NativeAlarmPlugin = {
  getStatus(): Promise<NativeAlarmStatus>;
  requestAlarmPermissions(): Promise<NativeAlarmStatus>;
  openAlarmSettings(): Promise<NativeAlarmStatus>;
  openFullScreenSettings(): Promise<NativeAlarmStatus>;
  schedule(options: { id: string; title: string; triggerAt: number }): Promise<NativeAlarmStatus>;
  cancel(options: { id: string }): Promise<void>;
  cancelAll(): Promise<void>;
  testAlarm(): Promise<NativeAlarmStatus>;
  getPendingAction(): Promise<Partial<NativeAlarmAction>>;
  clearPendingAction(options: { actionId: string }): Promise<void>;
};

const TwogetherAlarm = registerPlugin<NativeAlarmPlugin>("TwogetherAlarm");

export function isNativeAndroidApp() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export const nativeAlarm = {
  status: () => TwogetherAlarm.getStatus(),
  requestPermissions: () => TwogetherAlarm.requestAlarmPermissions(),
  openExactAlarmSettings: () => TwogetherAlarm.openAlarmSettings(),
  openFullScreenSettings: () => TwogetherAlarm.openFullScreenSettings(),
  schedule: (id: string, title: string, triggerAt: number) => TwogetherAlarm.schedule({ id, title, triggerAt }),
  cancel: (id: string) => TwogetherAlarm.cancel({ id }),
  cancelAll: () => TwogetherAlarm.cancelAll(),
  test: () => TwogetherAlarm.testAlarm(),
  pendingAction: () => TwogetherAlarm.getPendingAction(),
  clearPendingAction: (actionId: string) => TwogetherAlarm.clearPendingAction({ actionId }),
};
