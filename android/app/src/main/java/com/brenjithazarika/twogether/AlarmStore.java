package com.brenjithazarika.twogether;

import android.content.Context;
import android.content.SharedPreferences;

final class AlarmStore {
    private static final String PREFS = "twogether_alarm_state";
    private static final String KEY_ID = "id";
    private static final String KEY_TITLE = "title";
    private static final String KEY_TRIGGER = "trigger_at";

    private AlarmStore() {}

    static void save(Context context, AlarmData alarm) {
        prefs(context).edit()
            .putString(KEY_ID, alarm.id)
            .putString(KEY_TITLE, alarm.title)
            .putLong(KEY_TRIGGER, alarm.triggerAt)
            .apply();
    }

    static AlarmData read(Context context) {
        SharedPreferences preferences = prefs(context);
        String id = preferences.getString(KEY_ID, null);
        long triggerAt = preferences.getLong(KEY_TRIGGER, 0L);
        if (id == null || triggerAt <= 0L) return null;
        return new AlarmData(id, preferences.getString(KEY_TITLE, "Focus session complete"), triggerAt);
    }

    static void clear(Context context, String id) {
        AlarmData current = read(context);
        if (current == null || id == null || current.id.equals(id)) prefs(context).edit().clear().apply();
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static final class AlarmData {
        final String id;
        final String title;
        final long triggerAt;

        AlarmData(String id, String title, long triggerAt) {
            this.id = id;
            this.title = title;
            this.triggerAt = triggerAt;
        }
    }
}
