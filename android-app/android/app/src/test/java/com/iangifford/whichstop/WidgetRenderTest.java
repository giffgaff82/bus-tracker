package com.iangifford.whichstop;

// Renders the widget in light and dark for each state into app/build/widget-shots/
// (made-up stops and times). Run: ./gradlew :app:testDebugUnitTest

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import java.io.FileOutputStream;

@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35)
public class WidgetRenderTest {
    Context c;

    void setup(double nextIn, double runIn, boolean tracked, boolean live) throws Exception {
        c = RuntimeEnvironment.getApplication();
        WidgetStore.prefs(c).edit().clear().commit();
        double now = WidgetStore.nowMins();
        JSONObject cfg = new JSONObject("{\"buffer\":0.5,\"run\":0.5,\"arriveBy\":\"23:58\",\"leaveAt\":null,\"dirs\":{\"out\":{\"label\":\"To Work\",\"stops\":["
            + "{\"atco\":\"A\",\"name\":\"Example Road\",\"walk\":4,\"services\":[{\"id\":101,\"line\":\"12\",\"heads\":[[\"City Centre\",0]]}]},"
            + "{\"atco\":\"B\",\"name\":\"High Street\",\"walk\":5,\"services\":[{\"id\":102,\"line\":\"10\",\"heads\":[[\"Market Square\",15]]}]}]}}}");
        WidgetStore.put(c, "config", cfg.toString());
        JSONArray tt = new JSONArray(), tt2 = new JSONArray();
        if (runIn > 0) tt.put(new JSONArray().put(1).put(WidgetStore.hhmm(now + runIn)).put("City Centre"));
        tt.put(new JSONArray().put(2).put(WidgetStore.hhmm(now + nextIn)).put("City Centre"));
        tt.put(new JSONArray().put(3).put(WidgetStore.hhmm(now + nextIn + 30)).put("City Centre"));
        tt2.put(new JSONArray().put(4).put(WidgetStore.hhmm(now + nextIn + 22 - 15)).put("Market Square"));
        String d = WidgetStore.today();
        WidgetStore.put(c, "tt_101_" + d, tt.toString());
        WidgetStore.put(c, "tt_102_" + d, tt2.toString());
        WidgetStore.put(c, "live", new JSONObject().put("dir", "out").put("at", System.currentTimeMillis()).put("trips", new JSONObject().put("2", 0)).toString());
        if (tracked) {
            JSONArray atcos = new JSONArray(), mins = new JSONArray();
            for (int k = 0; k <= 5; k++) { atcos.put("S" + k); mins.put(Math.round(now) - 3 + k * 2.4); }
            JSONObject t = new JSONObject().put("line", "12").put("stop", "Example Road").put("svcId", 101).put("tripId", 2).put("date", d)
                .put("aimed", mins.getDouble(5)).put("walk", 4).put("buffer", 0.5).put("dirLabel", "To Work").put("idx", 5).put("atcos", atcos).put("mins", mins);
            if (live) t.put("live", new JSONObject().put("at", System.currentTimeMillis() - 120000).put("delay", 2).put("prev", "S2"));
            WidgetStore.put(c, "tracked", t.toString());
        }
    }

    void shot(String name, String tab) throws Exception {
        WidgetStore.prefs(c).edit().putString("tab_7", tab).commit();
        RemoteViews rv = BusWidget.build(c, 7);
        FrameLayout parent = new FrameLayout(c);
        View v = rv.apply(c, parent);
        float dp = c.getResources().getDisplayMetrics().density;
        int w = (int) (360 * dp), h = (int) (190 * dp);
        v.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
        v.layout(0, 0, w, h);
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        v.draw(new Canvas(b));
        try (FileOutputStream o = new FileOutputStream("build/widget-shots/" + name + ".png")) { b.compress(Bitmap.CompressFormat.PNG, 100, o); }
    }

    void all(String mode) throws Exception {
        new java.io.File("build/widget-shots").mkdirs();
        setup(12.5, 0, true, true);  shot(mode + "-1-next", "next");
        setup(20, 3, false, false);  shot(mode + "-2-run", "next");
        setup(12.5, 0, true, true);  shot(mode + "-3-track-live", "track");
        setup(12.5, 0, true, false); shot(mode + "-4-track-est", "track");
        setup(12.5, 0, false, false); shot(mode + "-5-track-empty", "track");
        setup(95, 0, false, false);  shot(mode + "-6-next-later", "next");
    }

    @Test @Config(qualifiers = "w411dp-h891dp-xxhdpi") public void light() throws Exception { all("light"); }
    @Test @Config(qualifiers = "w411dp-h891dp-night-xxhdpi") public void dark() throws Exception { all("dark"); }
}
