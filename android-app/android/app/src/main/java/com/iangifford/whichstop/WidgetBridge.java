package com.iangifford.whichstop;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Lets the web app hand the widget its journey settings, the tracked bus and fresh live data. */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridge extends Plugin {
    /** Screen to open after the widget was tapped ("now" or "track"); read once by the web app. */
    static volatile String pendingView;

    @PluginMethod
    public void setConfig(PluginCall call) {
        Context c = getContext();
        JSObject cfg = call.getObject("config");
        String s = cfg == null ? null : cfg.toString();
        String old = WidgetStore.prefs(c).getString("config", null);
        WidgetStore.put(c, "config", s);
        if (s != null && !s.equals(old)) RefreshWorker.now(c);   // new stops: fetch their timetables
        RefreshWorker.schedule(c);
        BusWidget.updateAll(c);
        call.resolve();
    }

    @PluginMethod
    public void setTracked(PluginCall call) {
        Context c = getContext();
        JSObject t = call.getObject("tracked");
        WidgetStore.put(c, "tracked", t == null ? null : t.toString());
        if (t == null) WidgetStore.put(c, "tlive", null);
        BusWidget.updateAll(c);
        call.resolve();
    }

    @PluginMethod
    public void setLive(PluginCall call) {
        Context c = getContext();
        JSObject l = call.getObject("live");
        if (l != null) WidgetStore.put(c, "live", l.toString());
        BusWidget.updateAll(c);
        call.resolve();
    }

    @PluginMethod
    public void consumeLaunch(PluginCall call) {
        JSObject r = new JSObject();
        if (pendingView != null) r.put("view", pendingView);
        pendingView = null;
        call.resolve(r);
    }
}
