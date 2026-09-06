package com.brenjithazarika.twogether;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class AlarmService extends Service {
    static final String CHANNEL_ID = "twogether_focus_alarms_v1";
    private static final int NOTIFICATION_ID = 2407;
    private MediaPlayer player;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;

    static Intent startIntent(Context context, String id, String title) {
        return new Intent(context, AlarmService.class)
            .putExtra(AlarmScheduler.EXTRA_ID, id)
            .putExtra(AlarmScheduler.EXTRA_TITLE, title);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String id = intent == null ? null : intent.getStringExtra(AlarmScheduler.EXTRA_ID);
        String title = intent == null ? null : intent.getStringExtra(AlarmScheduler.EXTRA_TITLE);
        if (id == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (title == null || title.isBlank()) title = "Focus session complete";
        startForeground(NOTIFICATION_ID, notification(id, title));
        acquireWakeLock();
        startVibration();
        startRingtone();
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        stopRingtone();
        if (vibrator != null) vibrator.cancel();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Focus alarms",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Ringing alarms for completed Twogether focus sessions");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.enableLights(true);
        channel.setLightColor(Color.rgb(126, 103, 214));
        // AlarmService owns the looping ringtone and vibration so Stop/Snooze work consistently.
        channel.setSound(null, null);
        channel.enableVibration(false);
        manager.createNotificationChannel(channel);
    }

    private Notification notification(String id, String title) {
        PendingIntent fullScreen = PendingIntent.getActivity(
            this,
            4001,
            AlarmActivity.intent(this, id, title),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent stop = actionPendingIntent(AlarmActionReceiver.ACTION_STOP, id, title, 4002);
        PendingIntent snooze = actionPendingIntent(AlarmActionReceiver.ACTION_SNOOZE, id, title, 4003);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_alarm)
            .setContentTitle(title)
            .setContentText("Your focus timer is complete")
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(fullScreen)
            .setFullScreenIntent(fullScreen, true)
            .addAction(0, "Snooze 5 min", snooze)
            .addAction(0, "Stop", stop)
            .build();
    }

    private PendingIntent actionPendingIntent(String action, String id, String title, int requestCode) {
        Intent intent = new Intent(this, AlarmActionReceiver.class)
            .setAction(action)
            .putExtra(AlarmScheduler.EXTRA_ID, id)
            .putExtra(AlarmScheduler.EXTRA_TITLE, title);
        return PendingIntent.getBroadcast(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void acquireWakeLock() {
        PowerManager manager = getSystemService(PowerManager.class);
        wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Twogether:FocusAlarm");
        wakeLock.acquire(10 * 60_000L);
    }

    private void startVibration() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            vibrator = getSystemService(VibratorManager.class).getDefaultVibrator();
        } else {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        }
        if (vibrator == null || !vibrator.hasVibrator()) return;
        long[] pattern = {0, 650, 220, 650, 220, 1000, 400};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
        } else {
            vibrator.vibrate(pattern, 0);
        }
    }

    private void startRingtone() {
        stopRingtone();
        try (AssetFileDescriptor audio = getResources().openRawResourceFd(R.raw.twogether_alarm)) {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            player.setDataSource(audio.getFileDescriptor(), audio.getStartOffset(), audio.getLength());
            player.setLooping(true);
            player.setVolume(1f, 1f);
            player.setOnErrorListener((mp, what, extra) -> {
                stopRingtone();
                return true;
            });
            player.prepare();
            player.start();
        } catch (Exception error) {
            stopRingtone();
        }
    }

    private void stopRingtone() {
        if (player == null) return;
        try {
            if (player.isPlaying()) player.stop();
        } catch (IllegalStateException ignored) {
        }
        player.release();
        player = null;
    }
}
