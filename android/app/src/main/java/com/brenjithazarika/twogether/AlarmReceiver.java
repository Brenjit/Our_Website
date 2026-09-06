package com.brenjithazarika.twogether;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra(AlarmScheduler.EXTRA_ID);
        String title = intent.getStringExtra(AlarmScheduler.EXTRA_TITLE);
        AlarmStore.AlarmData current = AlarmStore.read(context);
        boolean isTest = AlarmScheduler.TEST_ID.equals(id);
        if (id == null || (!isTest && (current == null || !id.equals(current.id)))) return;
        String resolvedTitle = title == null ? current == null ? "Focus session complete" : current.title : title;
        Intent service = AlarmService.startIntent(context, id, resolvedTitle);
        ContextCompat.startForegroundService(context, service);
    }
}
