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
        context.stopService(new Intent(context, AlarmService.class));
        if (ACTION_SNOOZE.equals(intent.getAction()) && id != null) {
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
        AlarmActivity.finishVisibleInstance();
    }
}
