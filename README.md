# Taskflow — Tasks & Time

Taskflow is a lightweight, browser-based task manager and focus timer. It runs as a static site and does not require a server, build step, package installation, or account.

## Features

- **Home dashboard** with open-task and due-today counts, timer status, quick links, and upcoming tasks.
- **Task deadlines** displayed as individual cards or a task list. Card-view tasks rotate automatically, and each card shows a live countdown to its deadline.
- **Task management** to add, edit, complete, and delete tasks, with an optional note, deadline, and per-task display style.
- **Focus timer** that continues while you move between pages. Its start time and fired reminders are saved so elapsed time can be recalculated when you return to the site.
- **Multiple timer reminders** scheduled by elapsed minutes, with an on-page alert and browser speech synthesis.
- **Responsive layout** for desktop and mobile screens.

## Run locally

1. Download or clone this project.
2. Open `index.html` in a modern browser.

No build command is needed. The app uses the browser's `localStorage` to keep tasks, reminder intervals, and timer state in that browser profile. Clearing site data or using another browser/profile will not carry that data over.

## Publish with GitHub Pages

This project is a static site. In the repository on GitHub:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the branch containing these files and the **/(root)** folder, then save.
4. Wait for the Pages deployment to finish. GitHub will show the published URL in the Pages settings.

The `index.html`, `app.js`, and `styles.css` files must stay together in the published folder.

## Browser notes

- Timer elapsed time can be recalculated after returning to the page, but a browser tab cannot guarantee an exact alert while the browser is fully closed or suspended by the operating system.
- Voice alerts use the browser's speech-synthesis API and the voices installed on the device. The selected voice can vary by browser and operating system.
- Audio playback may require interacting with the page first, depending on browser autoplay rules.
- Task and timer data stays in that browser's local storage; it is not synced to a server.
