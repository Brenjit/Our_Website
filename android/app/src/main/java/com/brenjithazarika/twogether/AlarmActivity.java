package com.brenjithazarika.twogether;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;

import java.lang.ref.WeakReference;
import java.text.DateFormat;
import java.util.Date;

public class AlarmActivity extends AppCompatActivity {
    private static WeakReference<AlarmActivity> visibleInstance = new WeakReference<>(null);
    private String alarmId;
    private String alarmTitle;

    static Intent intent(Context context, String id, String title) {
        return new Intent(context, AlarmActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(AlarmScheduler.EXTRA_ID, id)
            .putExtra(AlarmScheduler.EXTRA_TITLE, title);
    }

    static void finishVisibleInstance() {
        AlarmActivity activity = visibleInstance.get();
        if (activity != null) activity.finishAndRemoveTask();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // An alarm must be explicitly stopped or snoozed.
            }
        });
        readIntent(getIntent());
        setContentView(buildView());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        readIntent(intent);
        setContentView(buildView());
    }

    @Override
    protected void onStart() {
        super.onStart();
        visibleInstance = new WeakReference<>(this);
    }

    @Override
    protected void onStop() {
        if (visibleInstance.get() == this) visibleInstance.clear();
        super.onStop();
    }

    private void readIntent(Intent intent) {
        alarmId = intent.getStringExtra(AlarmScheduler.EXTRA_ID);
        alarmTitle = intent.getStringExtra(AlarmScheduler.EXTRA_TITLE);
        if (alarmTitle == null || alarmTitle.isBlank()) alarmTitle = "Focus session complete";
    }

    private View buildView() {
        int padding = dp(28);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(padding, padding, padding, padding);
        root.setBackgroundColor(Color.rgb(243, 246, 244));

        TextView brand = text("♥  two.", 20, Color.rgb(113, 91, 196), Typeface.BOLD);
        root.addView(brand, wrapParams(0));

        TextView eyebrow = text("FOCUS COMPLETE", 13, Color.rgb(111, 126, 119), Typeface.BOLD);
        LinearLayout.LayoutParams eyebrowParams = wrapParams(dp(34));
        root.addView(eyebrow, eyebrowParams);

        TextView title = text(alarmTitle, 32, Color.rgb(35, 55, 47), Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        root.addView(title, wrapParams(dp(10)));

        TextView time = text(DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date()), 18, Color.rgb(104, 118, 112), Typeface.NORMAL);
        root.addView(time, wrapParams(dp(34)));

        Button snooze = button("Snooze for 5 minutes", Color.WHITE, Color.rgb(108, 89, 189));
        snooze.setOnClickListener(view -> perform(AlarmActionReceiver.ACTION_SNOOZE));
        root.addView(snooze, matchParams(dp(12)));

        Button stop = button("Stop alarm", Color.WHITE, Color.rgb(47, 139, 91));
        stop.setOnClickListener(view -> perform(AlarmActionReceiver.ACTION_STOP));
        root.addView(stop, matchParams(0));

        TextView note = text("Your completed session will still be waiting in Twogether.", 13, Color.rgb(118, 131, 125), Typeface.NORMAL);
        note.setGravity(Gravity.CENTER);
        root.addView(note, wrapParams(dp(26)));
        return root;
    }

    private void perform(String action) {
        sendBroadcast(new Intent(this, AlarmActionReceiver.class)
            .setAction(action)
            .putExtra(AlarmScheduler.EXTRA_ID, alarmId)
            .putExtra(AlarmScheduler.EXTRA_TITLE, alarmTitle));
        finishAndRemoveTask();
    }

    private TextView text(String value, int sp, int color, int style) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setTypeface(Typeface.create("sans", style));
        view.setGravity(Gravity.CENTER);
        return view;
    }

    private Button button(String label, int textColor, int backgroundColor) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(textColor);
        button.setTextSize(16);
        button.setAllCaps(false);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(backgroundColor));
        button.setMinHeight(dp(56));
        return button;
    }

    private LinearLayout.LayoutParams wrapParams(int topMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.topMargin = topMargin;
        return params;
    }

    private LinearLayout.LayoutParams matchParams(int bottomMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.bottomMargin = bottomMargin;
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
