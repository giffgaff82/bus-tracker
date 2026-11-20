package com.iangifford.whichstop;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridge.class);
        super.onCreate(savedInstanceState);
        fromWidget(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String v = fromWidget(intent);
        // app already open: tell the page straight away
        if (v != null && bridge != null) {
            bridge.triggerWindowJSEvent("whichstopWidget", "{\"view\":\"" + v + "\"}");
            WidgetBridge.pendingView = null;
        }
    }

    private String fromWidget(Intent i) {
        String v = i == null ? null : i.getStringExtra(BusWidget.EXTRA_VIEW);
        if ("now".equals(v) || "track".equals(v)) { WidgetBridge.pendingView = v; return v; }
        return null;
    }
}
