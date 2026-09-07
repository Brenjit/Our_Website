package com.brenjithazarika.twogether;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.UUID;

final class AlarmActionStore {
    private static final String PREFS = "twogether_pending_alarm_action";
    private static final String KEY_ACTION_ID = "action_id";
    private static final String KEY_ACTIVITY_ID = "activity_id";
    private static final String KEY_ACTION = "action";
    private static final String KEY_CREATED_AT = "created_at";

    private AlarmActionStore() {}

    static PendingAction save(Context context, String activityId, String action) {
        PendingAction pending = new PendingAction(UUID.randomUUID().toString(), activityId, action, System.currentTimeMillis());
        prefs(context).edit()
            .putString(KEY_ACTION_ID, pending.actionId)
            .putString(KEY_ACTIVITY_ID, pending.activityId)
            .putString(KEY_ACTION, pending.action)
            .putLong(KEY_CREATED_AT, pending.createdAt)
            .apply();
        return pending;
    }

    static PendingAction read(Context context) {
        SharedPreferences preferences = prefs(context);
        String actionId = preferences.getString(KEY_ACTION_ID, null);
        String activityId = preferences.getString(KEY_ACTIVITY_ID, null);
        String action = preferences.getString(KEY_ACTION, null);
        if (actionId == null || activityId == null || action == null) return null;
        return new PendingAction(actionId, activityId, action, preferences.getLong(KEY_CREATED_AT, 0L));
    }

    static void clear(Context context, String actionId) {
        PendingAction current = read(context);
        if (current != null && current.actionId.equals(actionId)) prefs(context).edit().clear().apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static final class PendingAction {
        final String actionId;
        final String activityId;
        final String action;
        final long createdAt;

        PendingAction(String actionId, String activityId, String action, long createdAt) {
            this.actionId = actionId;
            this.activityId = activityId;
            this.action = action;
            this.createdAt = createdAt;
        }
    }
}
