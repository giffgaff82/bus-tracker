# Notes

- **Design:** the screens, components and widget are in Figma (Bus App file).
- **Data:** [bustimes.org API](https://bustimes.org/api/) for stops, services, timetables and
  live vehicles; [postcodes.io](https://postcodes.io) and Nominatim for addresses; Valhalla/OSRM
  for walking times.
- **Hosting:** the web app is a static site. Today it's uploaded by hand to
  iangifford.com/bus/.

## Decisions

- One HTML file for the web app, so it can be hosted anywhere and saved for offline use.
- The Android app loads the live site rather than a bundled copy, so web updates reach it
  without reinstalling.
- The widget works out timetable times itself, so it stays right on days the app isn't opened.
- Plan ahead covers today and tomorrow only (a week view was considered and parked as too
  complicated).
