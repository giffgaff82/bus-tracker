package com.iangifford.whichstop;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Works out what each tab shows right now, from the stored data. No network here. */
final class WidgetModel {
    private static final double FRESH = 20; // minutes live data stays usable

    /** What the "Next bus" tab shows. */
    static final class Next {
        boolean empty; String emptyTitle, emptyText;
        String dirLabel = "";
        boolean run;            // red countdown: minutes until the bus, run for it
        String big, unit, sub;  // "6" "min" "until you leave"
        String stop, line, time, status;
        boolean live;
    }

    /** What the "Tracking" tab shows. */
    static final class Track {
        boolean empty; String emptyTitle, emptyText;
        String line, away, meta, meta2;
        boolean live, hdrLive;
        String hdr;
        int dots = -1;          // stops between the bus and you for the strip (-1 = hide strip)
        boolean more;           // more than 5 stops away
    }

    private static final class Dep {
        String stop, line; double expected, left, leave, walk; boolean live, go; double delay;
    }

    static Next next(Context c) {
        Next n = new Next();
        JSONObject cfg = WidgetStore.obj(c, "config");
        if (cfg == null) {
            n.empty = true; n.emptyTitle = "Set up your journeys";
            n.emptyText = "Open Which stop? and choose your stops."; return n;
        }
        double now = WidgetStore.nowMins();
        String key = WidgetStore.currentKey(cfg, now);
        JSONObject dir = cfg.optJSONObject("dirs").optJSONObject(key);
        n.dirLabel = dir.optString("label", key.equals("out") ? "To work" : "Home");
        double buffer = cfg.optDouble("buffer", 0.5), run = cfg.optDouble("run", 0.5);

        // live delays, if fresh and for this direction
        JSONObject live = WidgetStore.obj(c, "live"), liveTrips = null;
        if (live != null && key.equals(live.optString("dir")) && (System.currentTimeMillis() - live.optLong("at")) / 60000.0 <= FRESH)
            liveTrips = live.optJSONObject("trips");

        String today = WidgetStore.today();
        List<Dep> deps = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        boolean anyTimetable = false;
        JSONArray stops = dir.optJSONArray("stops");
        for (int day = 0; day <= 1; day++) {
            String date = WidgetStore.plusDays(today, day);
            for (int i = 0; stops != null && i < stops.length(); i++) {
                JSONObject s = stops.optJSONObject(i);
                double walk = s.optDouble("walk", 5);
                JSONArray svcs = s.optJSONArray("services");
                for (int k = 0; svcs != null && k < svcs.length(); k++) {
                    JSONObject v = svcs.optJSONObject(k);
                    JSONArray trips = WidgetStore.trips(c, v.optInt("id"), date, false);
                    if (trips == null) continue;
                    anyTimetable = true;
                    JSONArray heads = v.optJSONArray("heads");
                    for (int t = 0; t < trips.length(); t++) {
                        JSONArray tr = trips.optJSONArray(t);
                        String head = tr.optString(2);
                        Double off = null;
                        for (int h = 0; heads != null && h < heads.length(); h++)
                            if (head.equals(heads.optJSONArray(h).optString(0))) { off = heads.optJSONArray(h).optDouble(1); break; }
                        if (off == null) continue;
                        double bus;
                        try { bus = WidgetStore.startMins(tr.optString(1)) + off + 1440 * day; } catch (Exception e) { continue; }
                        String id = String.valueOf(tr.optLong(0));
                        Dep d = new Dep();
                        d.delay = (day == 0 && liveTrips != null && liveTrips.has(id)) ? liveTrips.optDouble(id, 0) : 0;
                        d.live = day == 0 && liveTrips != null && liveTrips.has(id);
                        d.expected = bus + d.delay;
                        d.left = d.expected - now;
                        d.walk = walk;
                        if (d.left < walk * run || d.left > 18 * 60) continue;   // missed, or too far ahead
                        d.leave = d.left - walk - buffer;
                        d.go = d.left >= walk + buffer;
                        d.stop = s.optString("name"); d.line = v.optString("line");
                        if (!seen.add(s.optString("atco") + "|" + d.line + "|" + Math.round(bus))) continue;
                        deps.add(d);
                    }
                }
            }
        }
        if (deps.isEmpty()) {
            n.empty = true;
            n.emptyTitle = anyTimetable ? "No more buses for now" : "Getting bus times…";
            n.emptyText = anyTimetable ? "Nothing from your stops in the next 18 hours." : "Open Which stop? if this doesn't update soon.";
            return n;
        }
        deps.sort((a, b) -> Double.compare(a.expected, b.expected));
        Dep first = deps.get(0), firstGo = null;
        for (Dep d : deps) if (d.go) { firstGo = d; break; }
        // only tell people to run when the next comfortable bus is a long wait
        Dep pick = (!first.go && (firstGo == null || firstGo.expected - first.expected > 10)) ? first : (firstGo != null ? firstGo : first);

        n.stop = pick.stop; n.line = pick.line; n.time = WidgetStore.hhmm(pick.expected); n.live = pick.live;
        n.status = pick.live ? timing(pick.delay) : "timetable";
        if (!pick.go) {
            n.run = true; n.big = String.valueOf(Math.max(0, (int) Math.round(pick.left))); n.unit = "min"; n.sub = "run for it";
        } else if (pick.leave < 1) {
            n.big = "Go"; n.unit = "now"; n.sub = "walk to the stop";
        } else if (pick.leave < 60) {
            n.big = String.valueOf((int) Math.floor(pick.leave)); n.unit = "min"; n.sub = "until you leave";
        } else {
            n.big = WidgetStore.hhmm(now + pick.leave); n.unit = "leave";
            n.sub = (now + pick.leave) >= 1440 ? "tomorrow" : "at this time";
        }
        return n;
    }

    static String timing(double delay) {
        long l = Math.round(delay);
        return l > 0 ? l + " min late" : l < 0 ? (-l) + " min early" : "on time";
    }

    static Track track(Context c) {
        Track r = new Track();
        JSONObject t = WidgetStore.obj(c, "tracked");
        if (t == null) return emptyTrack(r);
        String today = WidgetStore.today();
        int dayOff;
        try { dayOff = WidgetStore.daysBetween(today, t.optString("date")); } catch (Exception e) { return emptyTrack(r); }
        double now = WidgetStore.nowMins();
        double walk = t.optDouble("walk", 5), buffer = t.optDouble("buffer", 0.5), aimed = t.optDouble("aimed");

        // freshest live data: from the app, or from the background refresh
        double delay = 0; String prev = null; boolean live = false; long at = 0;
        JSONObject jl = t.optJSONObject("live");
        JSONObject nl = WidgetStore.obj(c, "tlive");
        if (nl != null && nl.optLong("tripId") != t.optLong("tripId")) nl = null;
        JSONObject best = null;
        if (jl != null) best = jl;
        if (nl != null && (best == null || nl.optLong("at") > best.optLong("at"))) best = nl;
        boolean liveSaysNotLive = best != null && best == nl && !nl.optBoolean("live", false);
        if (best != null && !liveSaysNotLive && dayOff == 0 && (System.currentTimeMillis() - best.optLong("at")) / 60000.0 <= FRESH) {
            live = true; delay = best.optDouble("delay", 0); prev = best.isNull("prev") ? null : best.optString("prev", null);
        }
        if (best != null) at = best.optLong("at");

        double expected = aimed + delay + 1440 * dayOff, left = expected - now, leave = expected - walk - buffer;
        if (dayOff < 0 || left < -60) return emptyTrack(r);

        r.line = t.optString("line");
        String stop = t.optString("stop");
        int idx = t.optInt("idx", -1);
        JSONArray atcos = t.optJSONArray("atcos"), mins = t.optJSONArray("mins");
        int pIdx = -1; boolean est = !live;
        if (dayOff == 0 && idx >= 0) {
            if (live && prev != null && atcos != null) {
                for (int k = 0; k < atcos.length(); k++) if (prev.equals(atcos.optString(k))) { pIdx = k; break; }
                if (pIdx < 0 && left < 0) pIdx = idx;                      // past the stops we know about
            } else if (mins != null) {
                for (int k = 0; k <= idx && k < mins.length(); k++) {
                    if (mins.isNull(k)) continue;
                    if (mins.optDouble(k) + delay <= now) pIdx = k; else break;
                }
            }
        }
        boolean departed = dayOff == 0 && (left < -1.5 || (idx >= 0 && pIdx >= idx && (live || left < -1)));

        r.live = live; r.hdrLive = live;
        r.hdr = live ? "live" : "timetable";
        if (departed) {
            r.away = "Left your stop";
            r.meta = "The " + r.line + " left " + stop + " at " + WidgetStore.hhmm(expected);
            r.meta2 = "Open Which stop? if you caught it";
        } else if (dayOff > 0) {
            r.away = dayOff == 1 ? "Tomorrow" : "In " + dayOff + " days";
            r.meta = WidgetStore.hhmm(expected) + " from " + stop + " · leave " + WidgetStore.hhmm(leave);
            r.meta2 = t.optString("dirLabel", "");
            r.hdr = "timetable"; r.hdrLive = false;
        } else {
            if (idx >= 0 && pIdx >= 0 && pIdx < idx) {
                int n = idx - pIdx;
                r.away = n == 1 ? "Next stop is yours" : (est ? "About " : "") + n + " stops away";
                r.dots = Math.min(n, 5); r.more = n > 5;
            } else {
                r.away = "Not set off yet";
            }
            double leaveIn = leave - now;
            r.meta = "Due at " + stop + " " + WidgetStore.hhmm(expected) + " · " + (leaveIn < 0 ? "go now" : "leave " + WidgetStore.hhmm(leave));
            if (live) {
                long ago = Math.max(0, Math.round((System.currentTimeMillis() - at) / 60000.0));
                r.meta2 = timing(delay) + " · updated " + (ago < 1 ? "just now" : ago + " min ago");
            } else {
                r.meta2 = "Estimated from the timetable";
            }
        }
        return r;
    }

    private static Track emptyTrack(Track r) {
        r.empty = true; r.emptyTitle = "No bus tracked";
        r.emptyText = "Open Which stop? and tap a bus to follow it here.";
        return r;
    }

    static String a11y(Next n) {
        if (n.empty) return n.emptyTitle;
        return String.format(Locale.UK, "%s: the %s at %s from %s, %s %s %s", n.dirLabel, n.line, n.time, n.stop, n.big, n.unit, n.sub);
    }
}
