package io.github.sofaleya.schitalochka;

import android.app.Notification;
import android.os.Process;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import static org.junit.Assert.assertEquals;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class BankListenerTest {
    private static final String ALFA = "ru.alfabank.mobile.android";
    private static final String ALFA_TRANSFER = "Списание со счёта 4*7854. Perevod на 570.00 RUR";
    private static final long TIME = 1_800_000_000_000L;
    private BankListener listener;

    @Before
    public void setUp() {
        listener = Robolectric.setupService(BankListener.class);
    }

    @Test
    public void queuesAlfaTransferFromExpandedTextOnce() throws Exception {
        Notification notification = notification("Альфа-Банк", "Списание со счёта 4*7854");
        notification.extras.putCharSequence(Notification.EXTRA_BIG_TEXT, ALFA_TRANSFER);
        post(ALFA, notification, TIME);
        post(ALFA, notification, TIME + 1_000);

        JSONArray queue = take();
        assertEquals(1, queue.length());
        assertEquals(ALFA, queue.getJSONObject(0).getString("pkg"));
        assertEquals(ALFA_TRANSFER, queue.getJSONObject(0).getString("text"));
    }

    @Test
    public void queuesTransliteratedOperationsAndClassicPurchase() throws Exception {
        post(ALFA, notification("Альфа-Банк", "Perevod 570.00 RUR ot Анна"), TIME);
        post(ALFA, notification("Zachislenie", "1\u202f200,50 rur"), TIME);
        post(ALFA, notification("Альфа-Банк", "Pokupka 100.50 RUB"), TIME);
        post("ru.sberbankmobile", notification("Сбер", "Покупка 369 ₽. Баланс 15 279 ₽"), TIME);

        assertEquals(4, take().length());
    }

    @Test
    public void ignoresNonBanksSummariesAndNonTransactions() throws Exception {
        post("org.telegram.messenger", notification("Альфа-Банк", ALFA_TRANSFER), TIME);
        Notification summary = notification("Альфа-Банк", ALFA_TRANSFER);
        summary.flags |= Notification.FLAG_GROUP_SUMMARY;
        post(ALFA, summary, TIME);
        post(ALFA, notification("Альфа-Банк", "Код для перевода 570.00 RUR: 1234"), TIME);
        post(ALFA, notification("Альфа-Банк", "Perevod отклонён: 570.00 RUR"), TIME);
        post(ALFA, notification("Альфа-Банк", "Списание со счёта 4*7854. Баланс 570.00 RUR"), TIME);
        post(ALFA, notification("Альфа-Банк", "Perevod 570.00 RURXYZ"), TIME);
        post(ALFA, notification("Альфа-Банк", "Megaperevod 570.00 RUR"), TIME);

        assertEquals(0, take().length());
    }

    @Test
    public void disabledImportDoesNotCollectAndPurgesOldData() throws Exception {
        listener.onNotificationPosted(new StatusBarNotification(
                ALFA, ALFA, 1, null, 0, 0, 0, notification("Альфа-Банк", ALFA_TRANSFER), Process.myUserHandle(), TIME));
        assertEquals(0, take().length());
        assertEquals(0, new JSONArray(BankListener.diagnostics(listener)).length());
        BankListener.add(listener, ALFA, "Альфа-Банк", ALFA_TRANSFER, TIME);
        BankListener.diagnostic(listener, "org.telegram.messenger", "private", "private", "ignored", TIME);
        BankListener.purgeWhenDisabled(listener);
        assertEquals(0, take().length());
        assertEquals(0, new JSONArray(BankListener.diagnostics(listener)).length());
    }

    private Notification notification(String title, String text) {
        return new Notification.Builder(listener, "test")
                .setContentTitle(title)
                .setContentText(text)
                .build();
    }

    private void post(String pkg, Notification notification, long time) {
        listener.processNotification(new StatusBarNotification(
                pkg, pkg, 1, null, 0, 0, 0, notification, Process.myUserHandle(), time));
    }

    private JSONArray take() throws Exception {
        return new JSONArray(BankListener.take(listener));
    }
}
