package com.iangifford.whichstop;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

/**
 * The "Which stop?" home-screen widget: a "Next bus" tab and a "Tracking" tab.
 * It redraws itself every minute (no network needed for that) and a background
 * job refreshes timetables and live delays roughly every 15 minutes.
 */
public class BusWidget extends AppWidgetProvider {
    static final String ACTION_TAB = "com.iangifford.whichstop.WIDGET_TAB";
    static final String ACTION_TICK = "com.iangifford.whichstop.WIDGET_TICK";
    static final String EXTRA_TAB = "tab";
    static final String EXTRA_VIEW = "widget_view";

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) render(c, m, id);
        scheduleTick(c);
        RefreshWorker.schedule(c);
    }

    @Override
    public void onEnabled(Context c) {
        RefreshWorker.schedule(c);
        RefreshWorker.now(c);
    }

    @Override
    public void onDisabled(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(tickIntent(c));
        RefreshWorker.cancel(c);
    }

    @Override
    public void onDeleted(Context c, int[] ids) {
        android.content.SharedPreferences.Editor e = WidgetStore.prefs(c).edit();
        for (int id : ids) e.remove("tab_" + id);
        e.apply();
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle o) {
        render(c, m, id);
    }

    @Override
    public void onReceive(Context c, Intent i) {
        String a = i.getAction();
        if (ACTION_TAB.equals(a)) {
            int id = i.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            String tab = i.getStringExtra(EXTRA_TAB);
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID && tab != null) {
                WidgetStore.prefs(c).edit().putString("tab_" + id, tab).apply();
                render(c, AppWidgetManager.getInstance(c), id);
            }
            return;
        }
        if (ACTION_TICK.equals(a)) { updateAll(c); return; }
        super.onReceive(c, i);
    }

    /** Redraw every widget (called by the app, the background job and the minute tick). */
    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, BusWidget.class));
        for (int id : ids) render(c, m, id);
        if (ids.length > 0) scheduleTick(c);
    }

    static void render(Context c, AppWidgetManager m, int id) {
        m.updateAppWidget(id, build(c, id));
    }

    static RemoteViews build(Context c, int id) {
        String tab = WidgetStore.prefs(c).getString("tab_" + id, "next");
        boolean tracking = "track".equals(tab);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_bus);

        // tabs
        v.setViewVisibility(R.id.tab_next_on, tracking ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.tab_next_off, tracking ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.tab_track_on, tracking ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.tab_track_off, tracking ? View.GONE : View.VISIBLE);
        v.setOnClickPendingIntent(R.id.tab_next_off, tabIntent(c, id, "next"));
        v.setOnClickPendingIntent(R.id.tab_next_on, tabIntent(c, id, "next"));
        v.setOnClickPendingIntent(R.id.tab_track_off, tabIntent(c, id, "track"));
        v.setOnClickPendingIntent(R.id.tab_track_on, tabIntent(c, id, "track"));
        v.setOnClickPendingIntent(R.id.body, openIntent(c, tracking ? "track" : "now"));

        if (!tracking) fillNext(c, v); else fillTrack(c, v);
        return v;
    }

    private static void fillNext(Context c, RemoteViews v) {
        WidgetModel.Next n = WidgetModel.next(c);
        v.setViewVisibility(R.id.track, View.GONE);
        v.setViewVisibility(R.id.hdr_dot, View.GONE);
        v.setTextViewText(R.id.hdr_text, n.dirLabel);
        if (n.empty) {
            v.setViewVisibility(R.id.next, View.GONE);
            v.setViewVisibility(R.id.empty, View.VISIBLE);
            v.setImageViewResource(R.id.empty_icon, R.drawable.w_marker_est);
            v.setTextViewText(R.id.empty_title, n.emptyTitle);
            v.setTextViewText(R.id.empty_text, n.emptyText);
            return;
        }
        v.setViewVisibility(R.id.empty, View.GONE);
        v.setViewVisibility(R.id.next, View.VISIBLE);
        v.setViewVisibility(R.id.big, n.run ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.unit, n.run ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.sub, n.run ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.big_run, n.run ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.unit_run, n.run ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.sub_run, n.run ? View.VISIBLE : View.GONE);
        v.setTextViewText(n.run ? R.id.big_run : R.id.big, n.big);
        v.setTextViewText(n.run ? R.id.unit_run : R.id.unit, n.unit);
        v.setTextViewText(n.run ? R.id.sub_run : R.id.sub, n.sub);
        // long times ("17:22") need a smaller size to fit
        v.setTextViewTextSize(n.run ? R.id.big_run : R.id.big, android.util.TypedValue.COMPLEX_UNIT_SP, n.big.length() > 3 ? 44 : 58);
        v.setImageViewResource(R.id.fig, n.run ? R.drawable.w_fig_run : R.drawable.w_fig_walk);
        v.setTextViewText(R.id.stop, n.stop);
        v.setTextViewText(R.id.badge, n.line);
        v.setTextViewText(R.id.time, n.time);
        v.setImageViewResource(R.id.dot, n.live ? R.drawable.w_dot_live : R.drawable.w_dot_grey);
        v.setTextViewText(R.id.status, n.status);
        v.setContentDescription(R.id.body, WidgetModel.a11y(n));
    }

    private static void fillTrack(Context c, RemoteViews v) {
        WidgetModel.Track t = WidgetModel.track(c);
        v.setViewVisibility(R.id.next, View.GONE);
        if (t.empty) {
            v.setViewVisibility(R.id.track, View.GONE);
            v.setViewVisibility(R.id.empty, View.VISIBLE);
            v.setViewVisibility(R.id.hdr_dot, View.GONE);
            v.setTextViewText(R.id.hdr_text, "");
            v.setImageViewResource(R.id.empty_icon, R.drawable.w_marker_est);
            v.setTextViewText(R.id.empty_title, t.emptyTitle);
            v.setTextViewText(R.id.empty_text, t.emptyText);
            v.setContentDescription(R.id.body, t.emptyTitle);
            return;
        }
        v.setViewVisibility(R.id.empty, View.GONE);
        v.setViewVisibility(R.id.track, View.VISIBLE);
        v.setViewVisibility(R.id.hdr_dot, View.VISIBLE);
        v.setImageViewResource(R.id.hdr_dot, t.hdrLive ? R.drawable.w_dot_live : R.drawable.w_dot_grey);
        v.setTextViewText(R.id.hdr_text, t.hdr);
        v.setTextViewText(R.id.xl, t.line);
        v.setTextViewText(R.id.away, t.away);
        v.setTextViewText(R.id.meta, t.meta);
        v.setTextViewText(R.id.meta2, t.meta2);
        v.setContentDescription(R.id.body, "Tracking the " + t.line + ". " + t.away + ". " + t.meta);

        // the "3 stops away" strip: bus, then a dot per stop, ending at your stop
        v.removeAllViews(R.id.strip);
        if (t.dots > 0) {
            v.setViewVisibility(R.id.strip, View.VISIBLE);
            String p = c.getPackageName();
            v.addView(R.id.strip, new RemoteViews(p, t.live ? R.layout.w_strip_bus_live : R.layout.w_strip_bus_est));
            int seg = t.live ? R.layout.w_strip_seg : R.layout.w_strip_gap;   // estimated: spaced grey dots
            if (t.more) {
                v.addView(R.id.strip, new RemoteViews(p, seg));
                v.addView(R.id.strip, new RemoteViews(p, R.layout.w_strip_more));
            }
            for (int k = 0; k < t.dots; k++) {
                v.addView(R.id.strip, new RemoteViews(p, seg));
                boolean you = k == t.dots - 1;
                v.addView(R.id.strip, new RemoteViews(p, you ? R.layout.w_strip_you : (t.live ? R.layout.w_strip_dot : R.layout.w_strip_dot_est)));
            }
        } else {
            v.setViewVisibility(R.id.strip, View.GONE);
        }
    }

    private static PendingIntent tabIntent(Context c, int id, String tab) {
        Intent i = new Intent(c, BusWidget.class).setAction(ACTION_TAB)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id).putExtra(EXTRA_TAB, tab)
                .setData(Uri.parse("whichstop://widget/" + id + "/" + tab));
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent openIntent(Context c, String view) {
        Intent i = new Intent(c, MainActivity.class).putExtra(EXTRA_VIEW, view)
                .setData(Uri.parse("whichstop://open/" + view))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, view.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent tickIntent(Context c) {
        Intent i = new Intent(c, BusWidget.class).setAction(ACTION_TICK);
        return PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Redraw at the start of the next minute so the countdown stays right. Doesn't wake the phone. */
    static void scheduleTick(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        long now = System.currentTimeMillis(), next = (now / 60000 + 1) * 60000 + 500;
        PendingIntent pi = tickIntent(c);
        try {
            if (android.os.Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setExact(AlarmManager.RTC, next, pi);
            else am.set(AlarmManager.RTC, next, pi);
        } catch (SecurityException e) {
            am.set(AlarmManager.RTC, next, pi);
        }
    }
}
