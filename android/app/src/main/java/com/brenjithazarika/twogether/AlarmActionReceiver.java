package com.brenjithazarika.twogether;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmActionReceiver extends BroadcastReceiver {
    static final String ACTION_STOP = "com.brenjithazarika.twogether.STOP_ALARM";
    static final String ACTION_SNOOZE = "com.brenjithazarika.twogether.SNOOZE_ALARM";

    @Override
    public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra(AlarmScheduler.EXTRA_ID);
        String title = intent.getStringExtra(AlarmScheduler.EXTRA_TITLE);
        boolean snooze = ACTION_SNOOZE.equals(intent.getAction());
        context.stopService(new Intent(context, AlarmService.class));
        if (snooze && id != null) {
            if (AlarmScheduler.TEST_ID.equals(id)) {
                AlarmScheduler.scheduleTest(context, System.currentTimeMillis() + 5 * 60_000L);
            } else {
                AlarmScheduler.schedule(context, new AlarmStore.AlarmData(
                    id,
                    title == null ? "Focus session complete" : title,
                    System.currentTimeMillis() + 5 * 60_000L
                ));
            }
        } else {
            AlarmScheduler.cancel(context, id);
        }
        if (id != null && !AlarmScheduler.TEST_ID.equals(id)) {
            AlarmActionStore.save(context, id, snooze ? "snooze" : "stop");
            Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                context.startActivity(launch);
            }
        }
        AlarmActivity.finishVisibleInstance();
    }
}
