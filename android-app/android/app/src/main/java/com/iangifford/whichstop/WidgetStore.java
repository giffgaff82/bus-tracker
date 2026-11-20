package com.iangifford.whichstop;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Everything the widget knows, kept in SharedPreferences:
 *  config  – journey settings handed over by the web app (stops, services, walk times)
 *  tracked – the bus being tracked in the app (with its stops and times)
 *  live    – live delays for the current direction {dir, at, trips:{tripId: delayMins}}
 *  tlive   – live position of the tracked bus {tripId, at, delay, prev}
 *  tt_<service>_<date> – that day's trips [[id, start, headsign], ...] from bustimes.org
 */
final class WidgetStore {
    static final String API = "https://bustimes.org";
    static final ZoneId LONDON = ZoneId.of("Europe/London");
    private static final String PREFS = "whichstop_widget";

    private WidgetStore() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static JSONObject obj(Context c, String key) {
        String s = prefs(c).getString(key, null);
        if (s == null) return null;
        try { return new JSONObject(s); } catch (Exception e) { return null; }
    }

    static JSONArray arr(Context c, String key) {
        String s = prefs(c).getString(key, null);
        if (s == null) return null;
        try { return new JSONArray(s); } catch (Exception e) { return null; }
    }

    static void put(Context c, String key, String value) {
        SharedPreferences.Editor e = prefs(c).edit();
        if (value == null) e.remove(key); else e.putString(key, value);
        e.apply();
    }

    // ---- time (always UK time, like the web app) ----
    static ZonedDateTime now() { return ZonedDateTime.now(LONDON); }
    static String today() { return now().toLocalDate().toString(); }
    static String plusDays(String date, int n) { return LocalDate.parse(date).plusDays(n).toString(); }
    static double nowMins() { ZonedDateTime n = now(); return n.getHour() * 60 + n.getMinute() + n.getSecond() / 60.0; }
    static int daysBetween(String a, String b) { return (int) (LocalDate.parse(b).toEpochDay() - LocalDate.parse(a).toEpochDay()); }

    static int toMins(String hhmm) {
        String[] p = hhmm.trim().split(":");
        return Integer.parseInt(p[0]) * 60 + Integer.parseInt(p[1]);
    }

    /** "07:30" or "1 07:30" (next day) → minutes after midnight. */
    static int startMins(String s) {
        String[] p = s.trim().split(" ");
        return p.length > 1 ? Integer.parseInt(p[0]) * 1440 + toMins(p[1]) : toMins(p[0]);
    }

    static String hhmm(double mins) {
        int m = (int) Math.round(mins);
        int h = Math.floorMod(Math.floorDiv(m, 60), 24), mm = Math.floorMod(m, 60);
        return String.format(java.util.Locale.UK, "%02d:%02d", h, mm);
    }

    /** Which journey to show by time of day – the same rule as the web app. */
    static String currentKey(JSONObject cfg, double now) {
        JSONObject dirs = cfg.optJSONObject("dirs");
        if (dirs == null || !dirs.has("back") || cfg.isNull("leaveAt")) return "out";
        int a = toMins(cfg.optString("arriveBy", "09:00")), l = toMins(cfg.optString("leaveAt", "17:00"));
        if (l <= a) return "out";
        return now < (a + l) / 2.0 ? "out" : "back";
    }

    // ---- network ----
    static String get(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("User-Agent", "WhichStop-Android/1.0 (iangifford.com/bus)");
        try {
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) {
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
            }
            return sb.toString();
        } finally {
            c.disconnect();
        }
    }

    /** A day's trips for one service, cached for the day. */
    static JSONArray trips(Context c, int service, String date, boolean fetch) {
        String key = "tt_" + service + "_" + date;
        JSONArray cached = arr(c, key);
        if (cached != null || !fetch) return cached;
        try {
            JSONArray out = new JSONArray();
            String url = API + "/api/trips/?service=" + service + "&date=" + date;
            int pages = 0;
            while (url != null && !url.equals("null") && pages++ < 20) {
                JSONObject r = new JSONObject(get(url));
                JSONArray res = r.optJSONArray("results");
                if (res != null) for (int i = 0; i < res.length(); i++) {
                    JSONObject t = res.getJSONObject(i);
                    out.put(new JSONArray().put(t.optLong("id")).put(t.optString("start")).put(t.optString("headsign")));
                }
                url = r.isNull("next") ? null : r.optString("next", null);
            }
            put(c, key, out.toString());
            return out;
        } catch (Exception e) {
            return null;
        }
    }

    static Set<Integer> services(JSONObject cfg, String dirKey) {
        Set<Integer> ids = new LinkedHashSet<>();
        JSONObject dir = cfg.optJSONObject("dirs") == null ? null : cfg.optJSONObject("dirs").optJSONObject(dirKey);
        if (dir == null) return ids;
        JSONArray stops = dir.optJSONArray("stops");
        for (int i = 0; stops != null && i < stops.length(); i++) {
            JSONArray svcs = stops.optJSONObject(i).optJSONArray("services");
            for (int k = 0; svcs != null && k < svcs.length(); k++) ids.add(svcs.optJSONObject(k).optInt("id"));
        }
        return ids;
    }

    /** Background refresh: timetables for today and tomorrow, live delays, the tracked bus. */
    static void refresh(Context c) {
        JSONObject cfg = obj(c, "config");
        String today = today(), tomorrow = plusDays(today, 1);
        prune(c, today);
        if (cfg != null) {
            for (String k : new String[]{"out", "back"})
                for (int svc : services(cfg, k)) { trips(c, svc, today, true); trips(c, svc, tomorrow, true); }
            String key = currentKey(cfg, nowMins());
            Set<Integer> ids = services(cfg, key);
            if (!ids.isEmpty()) {
                try {
                    StringBuilder q = new StringBuilder();
                    for (int id : ids) { if (q.length() > 0) q.append(','); q.append(id); }
                    JSONArray vs = new JSONArray(get(API + "/vehicles.json?service=" + q));
                    JSONObject trips = new JSONObject();
                    for (int i = 0; i < vs.length(); i++) {
                        JSONObject v = vs.getJSONObject(i);
                        if (v.isNull("trip_id")) continue;
                        double d = v.optDouble("delay", 0) / 60.0;
                        if (Math.abs(d) > 40) continue; // matched to the wrong journey
                        trips.put(String.valueOf(v.optLong("trip_id")), d);
                    }
                    put(c, "live", new JSONObject().put("dir", key).put("at", System.currentTimeMillis()).put("trips", trips).toString());
                } catch (Exception ignored) {}
            }
        }
        JSONObject t = obj(c, "tracked");
        if (t != null && today.equals(t.optString("date"))) {
            try {
                JSONArray vs = new JSONArray(get(API + "/vehicles.json?service=" + t.optInt("svcId")));
                long trip = t.optLong("tripId");
                JSONObject found = null;
                for (int i = 0; i < vs.length(); i++) {
                    JSONObject v = vs.getJSONObject(i);
                    if (!v.isNull("trip_id") && v.optLong("trip_id") == trip) { found = v; break; }
                }
                JSONObject tl = new JSONObject().put("tripId", trip).put("at", System.currentTimeMillis());
                if (found != null && Math.abs(found.optDouble("delay", 0) / 60.0) <= 40) {
                    tl.put("live", true).put("delay", found.optDouble("delay", 0) / 60.0);
                    JSONObject pr = found.optJSONObject("progress");
                    if (pr != null && !pr.isNull("prev_stop")) tl.put("prev", pr.optString("prev_stop"));
                } else {
                    tl.put("live", false);
                }
                put(c, "tlive", tl.toString());
            } catch (Exception ignored) {}
        }
    }

    /** Drop cached timetables from past days. */
    static void prune(Context c, String today) {
        SharedPreferences p = prefs(c);
        List<String> old = new ArrayList<>();
        for (Map.Entry<String, ?> e : p.getAll().entrySet()) {
            String k = e.getKey();
            if (k.startsWith("tt_") && k.length() > 10 && k.substring(k.length() - 10).compareTo(today) < 0) old.add(k);
        }
        if (old.isEmpty()) return;
        SharedPreferences.Editor ed = p.edit();
        for (String k : old) ed.remove(k);
        ed.apply();
    }
}
