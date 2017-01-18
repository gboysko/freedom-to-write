const phantom = require('phantom');
const debug = require('debug')('freedom-to-write:freedom');
const phantomDebug = require('debug')('freedom-to-write:phantom');
const log = phantomDebug;
const Promise = require('bluebird');
const rp = require('request-promise');

// Phantom Creation options
const phantomArgs = ['--ignore-ssl-errors=yes', '--load-images=no'],
	phantomJsConfig = { logLevel: 'warn', logger: { warn: log, debug: log, info: log, error: log}};

const FREEDOM_URL_SIGNIN = 'https://freedom.to/sign-in';
const FREEDOM_URL_SESSION = 'https://freedom.to/session';
// const FREEDOM_URL_FREEDOM = 'https://freedom.to/freedom';
const FREEDOM_URL_DEVICES = 'https://freedom.to/devices';
const FREEDOM_URL_FILTER_LISTS = 'https://freedom.to/filter_lists';

module.exports = class FreedomIntegration {
	// Initialize Phantom...
	initialize() {
		const methodName = 'initialize';

		// Create a PhantomJS instance...
		return phantom.create(phantomArgs, phantomJsConfig).then(ph => {
			// Status...
			debug('%s: %s', methodName, 'Succesfully created PhantomJS');

			// Hold a reference to the phantom instance
			this.phInstance = ph;

			// Try to create a new page instance
			return this.phInstance.createPage().then(page => {
				// Status...
				debug('%s: %s', methodName, 'Successfully created PhantomJS page');

				// Hold a reference to the page instance
				this.pageInstance = page;
			});
		}).catch(err => {
			// Log it...
			debug('%s: %s', methodName, `Unable to initialize Freedom: ${err}`);

			throw new Error('Unable to initialize Freedom. Enable DEBUG for details.');
		});
	}

	// Submit the Freedom Login form (filling in email and password)
	submitLoginForm(email, password) {
		const methodName = 'submitLoginForm';

		return this.pageInstance.evaluate(function(email, password) {
			/* eslint-disable no-undef */
			var emailInput = document.querySelector('input[type=email]');
			var passwordInput = document.querySelector('input[type=password]');
			var loginForm = document.getElementById('login-form');

			// Put our data into the page...
			emailInput.value = email;
			passwordInput.value = password;
			loginForm.submit();
		}, email, password).then(() => {
			debug('%s: %s', methodName, 'Successfully submitted the email and password to the form.');
		});
	}

	// Handle a received resource
	onResourceReceived(resolve, reject, response) {
		const methodName = 'onResourceReceived';

		// Debugging...
		// debug('%s: %s', methodName, `Invoking onResourceReceived with this.constructor.name=${this.constructor.name}`);

		// Check to see if the resource URL is our session API Ajax call
		if (response.url === FREEDOM_URL_SESSION && response.stage === 'end') {
			// Check for a valid session
			const sessionStatusCode = response.status;

			// Record our session state on our Freedom instance...
			this.validSession = sessionStatusCode < 400;

			// If invalid, get out now...
			if (!this.validSession) {
				// Log it...
				debug('%s: %s', methodName, `Invalid status code from session page: ${sessionStatusCode}`);

				// Reject the promise...
				reject(new Error ('Login failed'));
				return;
			}

			// Log it...
			debug('%s: %s', methodName, 'Successfully logged into Freedom.');

			// Pull out the Set-Cookie key
			const setCookie = response.headers.filter(o => o.name === 'Set-Cookie').map(o => o.value)[0];

			// Put it into our cookie map
			this.cookieMap = setCookie.split('\n').map(e => e.split(';')[0]).reduce((map, elem) => {
				// Split by equal sign...
				const a = elem.split('=');

				// Put the name=value in the map
				map[a[0]] = a[1];

				return map;
			}, {});

			// Compute the value of the Cookies header
			this.cookies = Object.keys(this.cookieMap).map(k => `${k}=${this.cookieMap[k]}`).join('; ');

			// Log it...
			debug('%s: %s', methodName, `cookieMap:\n${Object.keys(this.cookieMap).map(k => `${k}=${this.cookieMap[k]}`).join('\n')}`);
			debug('%s: %s', methodName, `cookies: ${this.cookies}`);

			resolve();
		}
	}

	// Get our request options
	getRequestOptions(uri) {
		return {
			uri,
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
				'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36',
				'Cookie': this.cookies
			},
			json: true
		};
	}

	// Get the Devices JSON
	getDevices() {
		const methodName = 'getDevices';

		return rp(this.getRequestOptions(FREEDOM_URL_DEVICES)).then(deviceJson => {
			// Log it...
			debug('%s: %s', methodName, `Device JSON: ${JSON.stringify(deviceJson)}`);

			// Construct our device map
			this.deviceMap = (deviceJson.devices || []).reduce((map, elem) => {
				map[elem.name] = elem.id;

				return map;
			}, {});

			// Log it...
			debug('%s: %s', methodName, `Device Map: ${JSON.stringify(this.deviceMap)}`);
		}).catch(err => {
			// Log it...
			debug('%s: %s', methodName, `Request failed: ${err}`);

			throw new Error('Freedom API call failed');
		});
	}

	// Return the Device Map
	getDeviceMap() {
		return this.deviceMap;
	}

	// Get the Filter Lists JSON
	getFilterLists() {
		const methodName = 'getFilterLists';

		return rp(this.getRequestOptions(FREEDOM_URL_FILTER_LISTS)).then(filterListJson => {
			// Log it...
			debug('%s: %s', methodName, `Filter Lists JSON: ${JSON.stringify(filterListJson)}`);

			// Construct our filters lists map
			this.filterListsMap = (filterListJson.filter_lists || []).reduce((map, elem) => {
				map[elem.name] = elem.id;

				return map;
			}, {});

			// Log it...
			debug('%s: %s', methodName, `Filter Lists Map: ${JSON.stringify(this.filterListsMap)}`);
		}).catch(err => {
			debug('%s: %s', methodName, `Request failed: ${err}`);

			throw new Error('Freedom API call failed');
		});
	}

	// Return the Filter List Map
	getFilterListMap() {
		return this.filterListsMap;
	}

	// Login to Freedom
	login(email, password) {
		const methodName = 'login';

		return Promise.try(() => {
			// Try to open the sign-in page!
			return this.pageInstance.open(FREEDOM_URL_SIGNIN);
		}).then(status => {
			// Inspect status...
			if (status !== 'success') {
				// Log it...
				debug('%s: %s', methodName, `Unable to open the Freedom Sign-in Page: status=${status}`);

				throw new Error('Login failed. (Internal Error)');
			}

			// Status...
			debug('%s: %s', methodName, 'Successfully opened the Freedom Sign-in Page');

			// Try to submit the page!
			return this.submitLoginForm(email, password);
		}).then(() => {
			return new Promise((resolve, reject) => {
				// Register a function that receives each resource...
				this.pageInstance.on('onResourceReceived', this.onResourceReceived.bind(this, resolve, reject));
			});
		}).then(() => this.getDevices()).then(() => this.getFilterLists()).finally(() => {
			// Turn off event handler...
			this.pageInstance.off('onResourceReceived');
		});
	}

	// Shutdown the Freedom Integration on this instance...
	shutdown() {
		// Close the page instance...
		this.pageInstance.close();

		// Exit Phantom...
		this.phInstance.exit();
	}
};
