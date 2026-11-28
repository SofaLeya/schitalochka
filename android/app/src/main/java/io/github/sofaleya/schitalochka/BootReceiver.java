package io.github.sofaleya.schitalochka;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        BankListener.purgeWhenDisabled(c);
        Reminder.schedule(c);
    }
}
