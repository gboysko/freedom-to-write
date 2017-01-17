const electron = require('electron');
// Module to control application life.
const app = electron.app;
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;
// Module to receive messages
const {ipcMain} = electron;

const debug = require('debug')('freedom-to-write:main');

// Module to manage interactions with FreedomIntegration
const Freedom = require('./freedom');

const path = require('path');
const url = require('url');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let dialog, mainWindow;

// The desired word count to attain
let desiredWordCount;

// Whether we've reached our word count
let reachedWordCount = false;

// A reference to our Freedom object
let freedom;

// Handle messages (synch and asynch)
ipcMain.on('set-word-count', (event, arg) => {
	desiredWordCount = arg;
});
ipcMain.on('get-word-count', (event /*, arg*/) => {
	event.returnValue = desiredWordCount;
});
ipcMain.on('reached-word-count', (/* event, arg*/) => {
	reachedWordCount = true;
	mainWindow.setFullScreen(false);
	mainWindow.setClosable(true);
});
ipcMain.on('set-freedom-creds', (event, email, password) => {
	// Log it...
	debug(`on set-freedom-creds: email=${email}, password=${password}`);

	// Try to login to Freedom
	freedom.login(email, password).then(() => {
		debug('Sending login-success message');
		dialog.webContents.send('login-success', freedom.getDeviceMap(), freedom.getFilterListMap());
	}).catch(err => {
		debug('Sending login-failure message');
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

	// Open the DevTools.
	// dialog.webContents.openDevTools();

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

			// Open the DevTools.
			// mainWindow.webContents.openDevTools()

			// Handle the window close
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
	debug('event: ready');

	// Create a new instance of Freedom
	freedom = new Freedom();

	// Initialize it...
	/* eslint-disable no-console */
	freedom.initialize().then(() => {
		// Status...
		debug('Freedom initialized.');

		// Create our windows...
		createWindow();
	}).catch(err => {
		console.log(`Freedom failed to initialize: ${err}`);

		throw new Error(err);
	});
});

// Quit when all windows are closed.
app.on('window-all-closed', function () {
	debug(`event: window-all-closed: desiredWordCount=${desiredWordCount}, reachedWordCount=${reachedWordCount}`);

	// On OS X it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (desiredWordCount === undefined || reachedWordCount) {
		debug('calling app.quit()');
		app.quit();
	}
});

app.on('activate', function () {
	debug('event: activate');

	// On OS X it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (mainWindow === null) {
		createWindow();
	}
});
