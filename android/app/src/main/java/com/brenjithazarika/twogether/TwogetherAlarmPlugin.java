package com.brenjithazarika.twogether;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "TwogetherAlarm",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class TwogetherAlarmPlugin extends Plugin {
    @Override
    public void load() {
        AlarmService.createNotificationChannel(getContext());
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void requestAlarmPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
            return;
        }
        openRequiredSettings(call);
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        openRequiredSettings(call);
    }

    @PluginMethod
    public void openAlarmSettings(PluginCall call) {
        openExactAlarmSettings();
        call.resolve(status());
    }

    @PluginMethod
    public void openFullScreenSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT)
                .setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);
        }
        call.resolve(status());
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        String id = call.getString("id");
        String title = call.getString("title", "Focus session complete");
        Long triggerAt = call.getLong("triggerAt");
        if (id == null || id.isBlank() || triggerAt == null) {
            call.reject("A valid alarm id and trigger time are required");
            return;
        }
        if (triggerAt <= System.currentTimeMillis()) {
            call.reject("The alarm time must be in the future");
            return;
        }
        boolean exact = AlarmScheduler.schedule(
            getContext(),
            new AlarmStore.AlarmData(id, title, triggerAt)
        );
        JSObject result = status();
        result.put("scheduled", true);
        result.put("exact", exact);
        result.put("id", id);
        result.put("triggerAt", triggerAt);
        call.resolve(result);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        AlarmScheduler.cancel(getContext(), call.getString("id"));
        getContext().stopService(new Intent(getContext(), AlarmService.class));
        AlarmActivity.finishVisibleInstance();
        call.resolve();
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        AlarmScheduler.cancelCurrent(getContext(), true);
        getContext().stopService(new Intent(getContext(), AlarmService.class));
        AlarmActivity.finishVisibleInstance();
        call.resolve();
    }

    @PluginMethod
    public void testAlarm(PluginCall call) {
        long triggerAt = System.currentTimeMillis() + 12_000L;
        boolean exact = AlarmScheduler.scheduleTest(getContext(), triggerAt);
        JSObject result = status();
        result.put("scheduled", true);
        result.put("exact", exact);
        result.put("triggerAt", triggerAt);
        call.resolve(result);
    }

    private void openRequiredSettings(PluginCall call) {
        boolean opened = false;
        if (!AlarmScheduler.canScheduleExact(getContext())) {
            openExactAlarmSettings();
            opened = true;
        } else if (!canUseFullScreenIntent()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT)
                    .setData(Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(intent);
                opened = true;
            }
        }
        JSObject result = status();
        result.put("openedSettings", opened);
        call.resolve(result);
    }

    private void openExactAlarmSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
            .setData(Uri.parse("package:" + getContext().getPackageName()));
        getActivity().startActivity(intent);
    }

    private boolean notificationsGranted() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return getPermissionState("notifications") == PermissionState.GRANTED;
    }

    private boolean canUseFullScreenIntent() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true;
        return getContext().getSystemService(NotificationManager.class).canUseFullScreenIntent();
    }

    private JSObject status() {
        AlarmStore.AlarmData alarm = AlarmStore.read(getContext());
        JSObject result = new JSObject();
        result.put("native", true);
        result.put("notificationsGranted", notificationsGranted());
        result.put("exactAlarmGranted", AlarmScheduler.canScheduleExact(getContext()));
        result.put("fullScreenGranted", canUseFullScreenIntent());
        result.put("scheduled", alarm != null);
        if (alarm != null) {
            result.put("id", alarm.id);
            result.put("title", alarm.title);
            result.put("triggerAt", alarm.triggerAt);
        }
        return result;
    }
}
