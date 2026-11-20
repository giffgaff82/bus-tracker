# Which stop? – Android app

Wraps the live web app (https://iangifford.com/bus/) in a real Android app using
[Capacitor](https://capacitorjs.com), so it installs properly and adds:

- **Reminders** – "remind me 10 min before I leave" become real Android alarms that go off even
  when the app is closed.
- **A home-screen widget** – "Next bus" and "Tracking" tabs (see below).

Because the app loads the live site, **updating the web app updates the Android app too**.
Only rebuild this to change the widget, reminders, icon, name or permissions.

## Set up (once)

Needs [Node.js](https://nodejs.org) and [Android Studio](https://developer.android.com/studio).

```sh
cd android-app
npm install
npx cap sync android
```

Then in Android Studio: File → Open → `android-app/android`, and let Gradle sync.

### Signing key

New versions only install over the old one if they're signed with the same key, which is kept
**out of git**. Copy `android/keystore.properties.example` to `android/keystore.properties`
and point it at your `whichstop.keystore`:

```properties
storeFile=/Users/you/path/to/whichstop.keystore
storePassword=…
keyAlias=whichstop
keyPassword=…
```

Without it, builds still work but use Android Studio's debug key, so you'd need to uninstall
the existing app first.

## Install on a phone

- **From Android Studio:** turn on USB debugging (Settings → About phone → Software information
  → tap Build number 7 times, then Developer options → USB debugging), plug in, press ▶ Run.
- **From an APK:** Build → Build App Bundle(s) / APK(s) → Build APK(s), copy
  `app/build/outputs/apk/…/*.apk` to the phone and tap it. On Samsung, turn off Auto Blocker
  while installing (Settings → Security and privacy → Auto Blocker).

## Home-screen widget

Long-press the home screen → Widgets → Which stop? → drag it out (4×2).

- Tabs: "Next bus" and "Tracking". Tap to switch; the widget remembers your choice.
- Tap the rest of the widget to open the app on that screen.
- The countdown updates every minute. Timetables and live delays refresh about every
  15 minutes in the background (Android's limit), and immediately whenever the app is open.
- Follows the phone's light/dark setting.

Code: `android/app/src/main/java/com/iangifford/whichstop/`

| File | Does |
| --- | --- |
| `BusWidget.java` | The widget: tabs, drawing, minute tick |
| `WidgetModel.java` | Works out what each tab shows right now |
| `WidgetStore.java` | Stored data, bustimes.org requests, background refresh |
| `RefreshWorker.java` | Runs the refresh about every 15 minutes |
| `WidgetBridge.java` | Lets the web app pass in journeys, the tracked bus and live data |
| `MainActivity.java` | Opens the right screen when the widget is tapped |

Layout: `android/app/src/main/res/layout/widget_bus.xml`.

### Render check

```sh
cd android-app/android && ./gradlew :app:testDebugUnitTest
```

Draws every widget state in light and dark (with made-up stops) to `app/build/widget-shots/`.
