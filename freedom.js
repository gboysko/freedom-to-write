const phantom = require('phantom');
const Promise = require('bluebird');
const rp = require('request-promise');
const _ = require('lodash');
const log = require('electron-log');

// Phantom Creation options
const phantomArgs = ['--ignore-ssl-errors=yes', '--load-images=no'],
	phantomJsConfig = { logLevel: 'warn', logger: { warn: log.warn.bind(log), debug: log.debug.bind(log), info: log.info.bind(log), error: log.error.bind(log)}};

const FREEDOM_URL_SIGNIN = 'https://freedom.to/sign-in';
const FREEDOM_URL_SESSION = 'https://freedom.to/session';
// const FREEDOM_URL_FREEDOM = 'https://freedom.to/freedom';
const FREEDOM_URL_DEVICES = 'https://freedom.to/devices';
const FREEDOM_URL_FILTER_LISTS = 'https://freedom.to/filter_lists';
const FREEDOM_URL_SCHEDULES = 'https://freedom.to/schedules';

module.exports = class FreedomIntegration {
	// Initialize Phantom...
	initialize() {
		const methodName = 'initialize';

		// Create a PhantomJS instance...
		return phantom.create(phantomArgs, phantomJsConfig).then(ph => {
			// Status...
			log.verbose('%s: %s', methodName, 'Succesfully created PhantomJS');

			// Hold a reference to the phantom instance
			this.phInstance = ph;

			// Try to create a new page instance
			return this.phInstance.createPage().then(page => {
				// Status...
				log.verbose('%s: %s', methodName, 'Successfully created PhantomJS page');

				// Hold a reference to the page instance
				this.pageInstance = page;
			});
		}).catch(err => {
			// Log it...
			log.error('%s: %s', methodName, `Unable to initialize Freedom: ${err}`);

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
			log.verbose('%s: %s', methodName, 'Successfully submitted the email and password to the form.');
		});
	}

	// Handle a received resource
	onResourceReceived(resolve, reject, response) {
		const methodName = 'onResourceReceived';

		// Debugging...
		log.verbose('%s: %s', methodName, `Invoking onResourceReceived with response.url=${response.url}`);

		// Check to see if the resource URL is our session API Ajax call
		if (response.url === FREEDOM_URL_SESSION && response.stage === 'end') {
			// Check for a valid session
			const sessionStatusCode = response.status;

			// Record our session state on our Freedom instance...
			this.validSession = sessionStatusCode < 400;

			// If invalid, get out now...
			if (!this.validSession) {
				// Log it...
				log.error('%s: %s', methodName, `Invalid status code from session page: ${sessionStatusCode}`);

				// Reject the promise...
				reject(new Error ('Login failed'));
				return;
			}

			// Log it...
			log.verbose('%s: %s', methodName, 'Successfully logged into Freedom.');

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
			log.info('%s: %s', methodName, `cookieMap:\n${Object.keys(this.cookieMap).map(k => `${k}=${this.cookieMap[k]}`).join('\n')}`);
			log.info('%s: %s', methodName, `cookies: ${this.cookies}`);

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
			log.info('%s: %s', methodName, `Device JSON: ${JSON.stringify(deviceJson)}`);

			// Construct our device map
			this.deviceMap = (deviceJson.devices || []).reduce((map, elem) => {
				map[elem.name] = elem.id;

				return map;
			}, {});

			// Log it...
			log.info('%s: %s', methodName, `Device Map: ${JSON.stringify(this.deviceMap)}`);
		}).catch(err => {
			// Log it...
			log.error('%s: %s', methodName, `Request failed: ${err}`);

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
			log.info('%s: %s', methodName, `Filter Lists JSON: ${JSON.stringify(filterListJson)}`);

			// Construct our filters lists map
			this.filterListsMap = (filterListJson.filter_lists || []).reduce((map, elem) => {
				map[elem.name] = elem.id;

				return map;
			}, {});

			// Log it...
			log.info('%s: %s', methodName, `Filter Lists Map: ${JSON.stringify(this.filterListsMap)}`);
		}).catch(err => {
			log.error('%s: %s', methodName, `Request failed: ${err}`);

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
				log.error('%s: %s', methodName, `Unable to open the Freedom Sign-in Page: status=${status}`);

				throw new Error('Login failed. (Internal Error)');
			}

			// Status...
			log.verbose('%s: %s', methodName, 'Successfully opened the Freedom Sign-in Page');

			// Return a promise that either succeeds or fails with the session...
			return new Promise((resolve, reject) => {
				// Submit the credentials to the page!
				this.submitLoginForm(email, password);

				// Register a function that receives each resource...
				this.pageInstance.on('onResourceReceived', this.onResourceReceived.bind(this, resolve, reject));
			});
		}).then(() => this.getDevices()).then(() => this.getFilterLists()).finally(() => {
			// Turn off event handler...
			this.pageInstance.off('onResourceReceived');
		});
	}

	// Store the device IDs
	setDeviceIds(deviceIds) {
		// Debugging...
		log.info(`deviceIds=${JSON.stringify(deviceIds)}`);

		this.deviceIds = deviceIds;
	}

	// Store the filter IDs
	setFilterIds(filterIds) {
		// Debugging...
		log.info(`filterIds=${JSON.stringify(filterIds)}`);

		this.filterIds = filterIds;
	}

	// Create a new schedule for N seconds
	createSchedule(nSeconds) {
		const methodName = 'createSchedule',
			method = 'POST',
			body = JSON.stringify({filter_list_ids: this.filterIds, device_ids: this.deviceIds, duration: nSeconds, start_time: 'now'}),
			options = _.assign({}, this.getRequestOptions(FREEDOM_URL_SCHEDULES), {method, body, json: false});

		return rp(options).then(scheduleJsonText => {
			let scheduleJson;
			try {
				// Parse it...
				scheduleJson = JSON.parse(scheduleJsonText);
			} catch (err) {
				log.error('%s: %s', methodName, `Unable to parse JSON: ${err}`);
				throw new Error('Cannot parse the Schedule JSON.');
			}

			// Log it...
			log.info('%s: %s', methodName, `Schedule JSON: ${JSON.stringify(scheduleJson)}`);

			// Did the request fail?
			if (scheduleJson.status !== 'success') {
				log.error('%s: %s', methodName, 'Schedule creation failed!');

				throw new Error('Schedule was not created.');
			}

			// Verify that expected fields are present...
			if (!scheduleJson.schedule || !scheduleJson.schedule.id || !scheduleJson.schedule.time_left) {
				log.error('%s: %s', methodName, 'Missing expected fields: schedule, schedule.id or schedule.time_left');

				throw new Error('Schedule JSON contains missing fields.');
			}

			// Record the time remaining (seconds and the ID)
			this.scheduleId = scheduleJson.schedule.id;
			this.scheduleTimeLeft = scheduleJson.schedule.time_left;

			return this.scheduleTimeLeft;
		});
	}

	// How much time is left on the current schedule?
	timeRemaining() {
		const methodName = 'timeRemaining';

		return rp(this.getRequestOptions(FREEDOM_URL_SCHEDULES)).then(scheduleJson => {
			// Log it...
			// debug('%s: %s', methodName, `Schedule JSON: ${JSON.stringify(scheduleJson)}`);

			// Find our schedule...
			const sch = scheduleJson.schedule.filter(s => s.id === this.scheduleId);

			// Did we fail to find the schedule?
			if (sch.length !== 1) {
				log.warn('%s: %s', methodName, `Unable to find exactly 1 schedule with ID=${this.scheduleId}`);

				return 0; /* Indicate no time left */
			}

			// Log it...
			log.info('%s: %s', methodName, `Time remaining: ${sch[0].time_left}s`);

			return sch[0].time_left;
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
