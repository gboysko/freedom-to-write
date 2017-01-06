# To Do List

1. Disable the internet after word count supplied. Re-enable it when word count is reached.
1. Disable quitting the application (and the Freedom session) before the word count is reached.
    - http://electron.atom.io/docs/all/ see "Event: 'window-all-closed'" or "app.quit()" under methods?
    - https://github.com/electron/electron/blob/master/docs/api/app.md see "Event: 'before-quit'" ?
    - http://stackoverflow.com/questions/32885657/how-to-catch-the-event-of-clicking-the-app-windows-close-button-in-electron-app
1. Try to make file withstand a restart (make sure that the application-the text input part, not the dialogue box part, will reopen automatically in the circumstance that the computer is turned off then turned on before the word count is reached).
1. Put a bar on the bottom of the window that includes Goal (desired word count) and Word Count.
1. Display the time started instead of the full time.
1. Display the estimated completion time based on the typing rate over the last N minutes.
1. Display the actual words per minute typed.
1. When starting, show prior uses of the tool (date, # of words, duration)
