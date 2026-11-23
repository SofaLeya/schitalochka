package io.github.sofaleya.schitalochka;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.regex.Pattern;

/**
 * Ловит уведомления банков о покупках и зачислениях и складывает их в очередь.
 * Работает только если человек сам дал доступ к уведомлениям в настройках Android.
 * Берём только уведомления, где есть сумма в рублях и слово вроде «покупка» или «зачисление»,
 * и не из мессенджеров. Всё хранится только на телефоне, приложение забирает очередь при открытии.
 */
public class BankListener extends NotificationListenerService {

    static final String PREFS = "bank";
    private static final Pattern MONEY = Pattern.compile("\\d[\\d\\s\\u00a0]*(?:[.,]\\d{1,2})?\\s?(₽|руб|RUB|р\\.)", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern WORD = Pattern.compile("(покупк|оплат|списан|зачисл|поступ|пополн|перевод|возврат|снятие|платёж|платеж)", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final String[] SKIP = {"org.telegram", "com.whatsapp", "com.vkontakte", "ru.ok.", "com.viber", "com.discord", "ru.oneme", "com.google.android.gm", "ru.mail."};

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String pkg = sbn.getPackageName();
            if (pkg == null || pkg.equals(getPackageName())) return;
            for (String s : SKIP) if (pkg.startsWith(s)) return;
            Notification n = sbn.getNotification();
            if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle ex = n.extras;
            CharSequence title = ex.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence big = ex.getCharSequence(Notification.EXTRA_BIG_TEXT);
            CharSequence txt = ex.getCharSequence(Notification.EXTRA_TEXT);
            String text = (big != null ? big : txt != null ? txt : "").toString();
            String all = (title != null ? title + " " : "") + text;
            boolean money = MONEY.matcher(all).find(), word = WORD.matcher(all).find();
            diagnostic(this, pkg, title != null ? title.toString() : "", text, money && word ? "В очередь Android" : (!money ? "Не найдена сумма в рублях" : "Не найден тип операции"), sbn.getPostTime());
            if (!money || !word) return;
            add(this, pkg, title != null ? title.toString() : "", text, sbn.getPostTime());
        } catch (Exception ignored) {
        }
    }

    // Последние события остаются только на устройстве. Диагностика не отправляется в сеть.
    static synchronized void diagnostic(Context c, String pkg, String title, String text, String status, long time) {
        try {
            SharedPreferences p = c.getSharedPreferences(PREFS, MODE_PRIVATE);
            JSONArray a = new JSONArray(p.getString("diag", "[]"));
            JSONObject o = new JSONObject();
            o.put("pkg", pkg);
            o.put("title", title);
            o.put("text", text);
            o.put("status", status);
            o.put("t", time);
            a.put(o);
            while (a.length() > 20) a.remove(0);
            p.edit().putString("diag", a.toString()).apply();
        } catch (Exception ignored) {}
    }

    static synchronized String diagnostics(Context c) {
        return c.getSharedPreferences(PREFS, MODE_PRIVATE).getString("diag", "[]");
    }

    static synchronized void clearDiagnostics(Context c) {
        c.getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove("diag").apply();
    }

    static synchronized void add(Context c, String pkg, String title, String text, long time) throws Exception {
        SharedPreferences p = c.getSharedPreferences(PREFS, MODE_PRIVATE);
        JSONArray a = new JSONArray(p.getString("q", "[]"));
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.getJSONObject(i);
            if (o.optString("text").equals(text) && Math.abs(o.optLong("t") - time) < 120000) return; // повтор того же уведомления
        }
        JSONObject o = new JSONObject();
        o.put("pkg", pkg);
        o.put("title", title);
        o.put("text", text);
        o.put("t", time);
        a.put(o);
        while (a.length() > 60) a.remove(0);
        p.edit().putString("q", a.toString()).apply();
    }

    static synchronized String take(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, MODE_PRIVATE);
        String q = p.getString("q", "[]");
        p.edit().putString("q", "[]").apply();
        return q;
    }
}
