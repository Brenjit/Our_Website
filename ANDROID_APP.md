# Twogether Android app

The Android build wraps the live Twogether Worker and adds a native focus-alarm engine. The website remains the source of tasks and account data; alarms are scheduled locally on the phone so they do not depend on the browser, network, or Cloudflare cron after a focus session starts.

## Install

1. Copy `releases/Twogether-Android-v1.0.apk` to the Android phone.
2. Open the APK and allow installation from that source if Android asks.
3. Open Twogether and sign in normally.
4. Open **Alerts**, tap **Enable Android alarms**, allow notifications, and enable **Alarms & reminders**.
5. If offered, enable the lock-screen/full-screen alarm view.
6. Tap **Test alarm (12s)**, close the app, and lock the phone. Use **Stop alarm** or **Snooze for 5 minutes** when it rings.

## Alarm behavior

- Starting or resuming a timed task schedules an exact local alarm.
- Pausing, finishing, or switching tasks cancels the old alarm.
- The custom Twogether ringtone loops with repeating vibration until Stop or Snooze is pressed.
- Snooze schedules another alarm five minutes later.
- Pending alarms are restored after a phone reboot or app update.
- The alarm continues to work when the app is swiped away. Android intentionally disables an app's alarms after the user uses **Force stop**; reopen Twogether afterward.

## Rebuild

Install JDK 21 and Android SDK Platform 36, then run:

```sh
npm install
npm run android:build
```

The generated debug APK is located at `android/app/build/outputs/apk/debug/app-debug.apk`.
