package com.brenjithazarika.twogether;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

final class AlarmScheduler {
    static final String TEST_ID = "twogether-test";
    static final String EXTRA_ID = "alarm_id";
    static final String EXTRA_TITLE = "alarm_title";
    static final String EXTRA_TRIGGER_AT = "alarm_trigger_at";

    private AlarmScheduler() {}

    static boolean canScheduleExact(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return context.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }

    static boolean schedule(Context context, AlarmStore.AlarmData alarm) {
        cancelCurrent(context, false);
        AlarmStore.save(context, alarm);
        return schedulePendingIntent(context, alarm);
    }

    static boolean scheduleTest(Context context, long triggerAt) {
        return schedulePendingIntent(
            context,
            new AlarmStore.AlarmData(TEST_ID, "Twogether alarm test", triggerAt)
        );
    }

    private static boolean schedulePendingIntent(Context context, AlarmStore.AlarmData alarm) {
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        PendingIntent fireIntent = alarmPendingIntent(context, alarm);
        long triggerAt = Math.max(System.currentTimeMillis() + 500L, alarm.triggerAt);
        if (canScheduleExact(context)) {
            PendingIntent showIntent = PendingIntent.getActivity(
                context,
                requestCode(alarm.id) + 1,
                AlarmActivity.intent(context, alarm.id, alarm.title),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            manager.setAlarmClock(new AlarmManager.AlarmClockInfo(triggerAt, showIntent), fireIntent);
            return true;
        }
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, fireIntent);
        return false;
    }

    static void cancel(Context context, String id) {
        AlarmStore.AlarmData current = AlarmStore.read(context);
        if (current == null || (id != null && !id.equals(current.id))) return;
        cancelCurrent(context, true);
    }

    static void cancelCurrent(Context context, boolean clearStore) {
        AlarmStore.AlarmData current = AlarmStore.read(context);
        if (current != null) {
            context.getSystemService(AlarmManager.class).cancel(alarmPendingIntent(context, current));
            if (clearStore) AlarmStore.clear(context, current.id);
        }
    }

    static void restore(Context context) {
        AlarmStore.AlarmData alarm = AlarmStore.read(context);
        if (alarm == null) return;
        if (alarm.triggerAt < System.currentTimeMillis() - 60_000L) {
            AlarmStore.clear(context, alarm.id);
            return;
        }
        schedule(context, alarm);
    }

    private static PendingIntent alarmPendingIntent(Context context, AlarmStore.AlarmData alarm) {
        Intent intent = new Intent(context, AlarmReceiver.class)
            .putExtra(EXTRA_ID, alarm.id)
            .putExtra(EXTRA_TITLE, alarm.title)
            .putExtra(EXTRA_TRIGGER_AT, alarm.triggerAt);
        return PendingIntent.getBroadcast(
            context,
            requestCode(alarm.id),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static int requestCode(String id) {
        return 10_000 + (id.hashCode() & 0x3fffffff);
    }
}
