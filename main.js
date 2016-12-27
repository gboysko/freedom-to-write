const electron = require('electron');
// Module to control application life.
const app = electron.app;
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;
// Module to receive messages
const {ipcMain} = electron;

const path = require('path')
const url = require('url')

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let dialog, mainWindow;

// The desired word count to attain
let desiredWordCount;

// Handle a synchronous message
ipcMain.on('set-word-count', (event, arg) => {
	desiredWordCount = arg;
});
ipcMain.on('get-word-count', (event, arg) => {
	event.returnValue = desiredWordCount;
});

function createWindow () {
  // Create the browser dialog
  dialog = new BrowserWindow({width: 200, height: 120, frame: false, center: true});

  // and load the index.html of the app.
  dialog.loadURL(url.format({
    pathname: path.join(__dirname, 'dialog.html'),
    protocol: 'file:',
    slashes: true
  }));

  // Open the DevTools.
  // dialog.webContents.openDevTools()

  // Emitted when the window is closed.
  dialog.on('closed', function () {
	// Do we have a desired word count?
	if (desiredWordCount) {
  		// Create the main window
  		mainWindow = new BrowserWindow({width: 800, height: 600, frame: false, center: true});

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
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
	console.log('window-all-closed event called...');
    // app.quit()
  }
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
