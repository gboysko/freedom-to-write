const electron = require('electron');

// Module to control application life.
const {app, Menu} = electron;
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;
// Module to receive messages
const {ipcMain} = electron;
// Module for logging
const log = require('electron-log');
log.transports.file.level = 'silly';
log.info(`The path to the log file is ${log.transports.file.findLogPath('freedom-to-write')}`);

// Module for recording history, usage
const history = require('./History');

// Module to manage interactions with FreedomIntegration
const Freedom = require('./freedom');

const path = require('path');
const url = require('url');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let dialog, mainWindow;

// The desired word count to attain
let desiredWordCount;

// Our current word count...
let currentWordCount;

// The current block end time
let currentBlockEndTime;

// Whether we've reached our word count
let reachedWordCount = false;

// The ID of the next block renew/refresh timeout
let nextBlockTimeoutId;

// A reference to our Freedom object
let freedom;

// Compute the next schedule duration
const computeNextScheduleDuration = () => { return 60; };

// Block the internet for the next N seconds
const blockInternetForNSeconds = nSeconds => {
	// Create a new schedule
	freedom.createSchedule(nSeconds).then(timeRemg => {
		// Record the current block's end time
		currentBlockEndTime = Date.now() + timeRemg*1000;

		// Set a timeout for when the time is up...
		nextBlockTimeoutId = setTimeout(() => {
			// Compute how much time for next block
			const nextBlockDuration = computeNextScheduleDuration();

			// Block the internet...
			blockInternetForNSeconds(nextBlockDuration);
		}, timeRemg*1000);
	});
};

// What to do when the word count is set
ipcMain.on('set-word-count', (event, wordCount, deviceIds, filterIds) => {
	// Store our desired word count
	desiredWordCount = wordCount;

	// Indicate a desire to start a new session
	history.startNewSession(desiredWordCount);

	// Set the device and filter IDs to use for future blocks...
	freedom.setDeviceIds(deviceIds);
	freedom.setFilterIds(filterIds);

	// Start to block the internet!
	blockInternetForNSeconds(60);
});

// Get the desired word count...
ipcMain.on('get-word-count', (event /*, arg*/) => {
	event.returnValue = desiredWordCount;
});

// Get the projected end time for block...
ipcMain.on('get-schedule-end-time', event => {
	event.returnValue = currentBlockEndTime || (Date.now() + 10 * 1000); /* 10 from now */
});

// Get the current word count...
ipcMain.on('current-word-count', (event, wordCount) => {
	// Record our current word count...
	currentWordCount = wordCount;

	// Are we done?
	if (currentWordCount >= desiredWordCount && !reachedWordCount) {
		// Clear the current refresh timeout
		clearTimeout(nextBlockTimeoutId);

		// Indicate that we've reached the desired word count...
		reachedWordCount = true;

		// Reset the main window...
		mainWindow.setFullScreen(false);
		mainWindow.setClosable(true);
	}
});

// Set our Freedom credentials...
ipcMain.on('set-freedom-creds', (event, email, password) => {
	// Log it...
	log.info(`on set-freedom-creds: email=${email}, password=${password}`);

	// Try to login to Freedom
	freedom.login(email, password).then(() => {
		log.verbose('Sending login-success message');
		dialog.webContents.send('login-success', freedom.getDeviceMap(), freedom.getFilterListMap(), history.getAll());
	}).catch(err => {
		log.warn('Sending login-failure message');
		dialog.webContents.send('login-failure', err.message);
	});
});

function createWindow () {
	// Create the browser dialog
	dialog = new BrowserWindow({width: 800, height: 600, center: true, minimizable: false, maximizable: false});

	// and load the index.html of the app.
	dialog.loadURL(url.format({
		pathname: path.join(__dirname, 'dialog.html'),
		protocol: 'file:',
		slashes: true
	}));

	// Emitted when the window is closed.
	dialog.on('closed', function () {
		// Do we have a desired word count?
		if (desiredWordCount) {
			// Create the main window
			mainWindow = new BrowserWindow({width: 800, height: 600, frame: true, center: true});

			// Set the fullscreen mode
			mainWindow.setFullScreen(true);
			mainWindow.setClosable(false);

			// and load the index.html of the app.
			mainWindow.loadURL(url.format({
				pathname: path.join(__dirname, 'textInput.html'),
				protocol: 'file:',
				slashes: true
			}));

			// Create the Application's main menu
			var template = [{
				label: 'Application',
				submenu: [
					{ label: 'About Application', selector: 'orderFrontStandardAboutPanel:' },
					{ type: 'separator' },
					{ label: 'Quit', accelerator: 'Command+Q', click: function() { app.quit(); }}
				]}, {
					label: 'Edit',
					submenu: [
							{ label: 'Undo', accelerator: 'CmdOrCtrl+Z', selector: 'undo:' },
							{ label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', selector: 'redo:' },
							{ type: 'separator' },
							{ label: 'Cut', accelerator: 'CmdOrCtrl+X', selector: 'cut:' },
							{ label: 'Copy', accelerator: 'CmdOrCtrl+C', selector: 'copy:' },
							{ label: 'Paste', accelerator: 'CmdOrCtrl+V', selector: 'paste:' },
							{ label: 'Select All', accelerator: 'CmdOrCtrl+A', selector: 'selectAll:' }
					]}
			];

			Menu.setApplicationMenu(Menu.buildFromTemplate(template));			// Handle the window close

			// Handle the window close*
			mainWindow.on('closed', function () {
				mainWindow = null;
			});
		} else {
			// Dereference the window object, usually you would store windows
			// in an array if your app supports multi windows, this is the time
			// when you should delete the corresponding element.
			dialog = null;
		}
	});
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
	log.info('event: ready');

	// Create a new instance of Freedom
	freedom = new Freedom();

	// Initialize it...
	/* eslint-disable no-console */
	freedom.initialize().then(() => {
		// Status...
		log.info('Freedom initialized.');

		// Create our windows...
		createWindow();
	}).catch(err => {
		log.error(`Freedom failed to initialize: ${err}`);

		throw new Error(err);
	});
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
	log.info(`event: window-all-closed: desiredWordCount=${desiredWordCount}, reachedWordCount=${reachedWordCount}`);

	// On OS X it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (desiredWordCount === undefined || reachedWordCount) {
		if (currentWordCount) {
			// Log our history...
			history.endSession(currentWordCount);
		}

		// Shutdown Freedom integration
		log.verbose('Telling Freedom to shutdown');
		freedom.shutdown();
		freedom = null;

		// Quiting the application...
		log.verbose('calling app.quit()');
		app.quit();
	}
});

app.on('activate', function () {
	log.info('event: activate');

	// On OS X it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (mainWindow === null) {
		createWindow();
	}
});
