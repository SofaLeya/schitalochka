package io.github.sofaleya.schitalochka;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        SharedPreferences p = Reminder.prefs(c);
        if (p.getBoolean("on", false) && !Reminder.today().equals(p.getString("done", ""))) {
            Reminder.notifyNow(c);
        }
        Reminder.schedule(c); // следующее напоминание завтра
    }
}
