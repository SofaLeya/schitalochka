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
 * Берём только уведомления из приложений известных банков (whitelist packageName),
 * где есть сумма в рублях и слово вроде «покупка» или «зачисление».
 * Всё хранится только на телефоне, приложение забирает очередь при открытии.
 */
public class BankListener extends NotificationListenerService {

    static final String PREFS = "bank";
    private static final Pattern MONEY = Pattern.compile("\\d[\\d\\s\\u00a0]*(?:[.,]\\d{1,2})?\\s?(₽|руб|RUB|р\\.)", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern WORD = Pattern.compile("(покупк|оплат|списан|зачисл|поступ|пополн|перевод|возврат|снятие|платёж|платеж)", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    /* Точные packageName приложений банков (Сбер, Т-Банк, Альфа, ВТБ, ОТП и др.). */
    private static final String[] BANK_EXACT = {
            "ru.sberbankmobile",
            "ru.sberbank_sbbol",
            "com.idamob.tinkoff.android",
            "ru.alfabank.mobile.android",
            "ru.vtb24.mobilebanking.android",
            "ru.otpbank.mobile",
            "ru.gazprombank.android.mobilebank.app",
            "ru.raiffeisennews",
            "com.openbank",
            "ru.letobank.Prometheus",
            "ru.sovcomcard.halva.v1",
            "ru.mkb.mobile",
            "ru.bankuralsib.mb.android",
            "ru.bspb",
            "ru.akbars.mobile",
            "ru.mts.money",
            "ru.unicredit.android",
            "com.yandex.bank",
            "ru.yoo.money",
            "ru.rshb.dbo",
            "ru.bcs.bcsbank",
            "ru.finambank.app",
            "ru.psbank",
            "ru.rosbank.android",
            "ru.ozon.fintech.finance",
            "ru.tochka.bank",
            "ru.modulbank.mobile"
    };
    /* Семейства приложений банка: новые packageName того же банка тоже проходят. */
    private static final String[] BANK_PREFIX = {
            "ru.sberbank",
            "ru.alfabank.",
            "ru.tinkoff.",
            "com.idamob.tinkoff",
            "ru.vtb",
            "ru.gazprombank.",
            "ru.otpbank.",
            "ru.raiffeisen",
            "ru.psbank",
            "ru.rosbank.",
            "ru.rshb.",
            "ru.sovcombank",
            "ru.sovcomcard.",
            "ru.yoo.money",
            "ru.yoomoney",
            "com.yandex.bank",
            "ru.ozon.fintech",
            "ru.wb.",
            "ru.tochka.",
            "ru.modulbank",
            "ru.ftc.faktura.",
            "com.isimplelab.ibank.",
            "com.bifit.mobile.citizen."
    };

    /** Разрешён ли packageName как банковское приложение. */
    static boolean isBankPackage(String pkg) {
        if (pkg == null || pkg.isEmpty()) return false;
        for (String p : BANK_EXACT) if (pkg.equals(p)) return true;
        for (String p : BANK_PREFIX) if (pkg.startsWith(p)) return true;
        return false;
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String pkg = sbn.getPackageName();
            if (pkg == null || pkg.equals(getPackageName())) return;
            Notification n = sbn.getNotification();
            if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle ex = n.extras;
            CharSequence title = ex.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence big = ex.getCharSequence(Notification.EXTRA_BIG_TEXT);
            CharSequence txt = ex.getCharSequence(Notification.EXTRA_TEXT);
            String text = (big != null ? big : txt != null ? txt : "").toString();
            String all = (title != null ? title + " " : "") + text;
            if (!isBankPackage(pkg)) {
                diagnostic(this, pkg, title != null ? title.toString() : "", text, "Не банк (package)", sbn.getPostTime());
                return;
            }
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
