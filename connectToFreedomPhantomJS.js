const readline = require('readline-sync');
require('request').debug=true;

const phantom = require('phantom');
const rp = require('request-promise');

// Find a device by its name
const findDevice = (name, json) => {
	return (json.devices || []).filter(d => d.name === name).map(d => d.id);
};
const findBlockList = (name, json) => {
	return (json.filter_lists || []).filter(d => d.name === name).map(d => d.id);
};

// Phantom Creation options
const phantomArgs = ['--ignore-ssl-errors=yes', '--load-images=no'],
	phantomJsConfig = { logLevel: 'warn' };

// Create a PhantomJS instance...
phantom.create(phantomArgs, phantomJsConfig).then(ph => {
	// Status...
	console.log('Succesfully created PhantomJS');

	// Create a WebPage
	return ph.createPage().then(page => {
		// Try to open the sign-in page!
		page.open('https://freedom.to/sign-in/').then(status => {
			// Loaded the page!
			console.log(`Loaded the sign-in page: ${status}`);

			// Ask the user for their username and password
			const email = readline.question('What is your user email? ');

			// Ask for the password
			const password = readline.question('What is your password? ', { hideEchoBack: true});

			// Try to submit the page!
			return page.evaluate(function(email, password) {
				var emailInput = document.querySelector("input[type=email]");
				var passwordInput = document.querySelector("input[type=password]");
				var loginForm = document.getElementById("login-form");

				// Put our data into the page...
				emailInput.value = email;
				passwordInput.value = password;
				loginForm.submit();
			}, email, password);
		}).then(() => {
			// Create a cookieMap
			var cookieMap = {},
				foundFreedomPage = false;

			// Register a function that receives each resource...
			page.on('onResourceReceived', response => {
				// Check to see if the resource URL is 'https://freedom.to/session"
				if (response.url === 'https://freedom.to/session' && response.stage === 'end') {
					// Pull out the Set-Cookie key
					const setCookie = response.headers.filter(function(o) { return o.name === 'Set-Cookie';}).map(function(o) { return o.value; })[0];

					// Put it into our cookie map
					cookieMap = setCookie.split('\n').map(function(e) { return e.split(';')[0]; }).reduce(function(map, elem) { const a = elem.split('='); map[a[0]] = a[1]; return map; }, {});
				}
			});


			// Register a function to indicate when the page has finished loading...
			page.on('onLoadFinished', (status) => {
				// Try to find our current URL
				page.evaluate(function() {
					return window.location.href;
				}).then(url => {
					// Is this the freedom.to/freedom page?
					if (url === 'https://freedom.to/freedom' && !foundFreedomPage) {
						// Record that we found the freedom page...
						foundFreedomPage = true;

						// Build up the cookies, options...
						const cookies = Object.keys(cookieMap).map(k => `${k}=${cookieMap[k]}`).join('; '),
							options = {
								headers: {
									'Accept': 'application/json',
									'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36',
									'Cookie': cookies
								},
								json: true
							};

						// Try to retrieve the devices, lists...
						options.uri = 'https://freedom.to/devices';
						rp(options).then(deviceJson => {
							// console.log(`Devices JSON: ${JSON.stringify(deviceJson)}`);
							const name = 'scboysko-mac',
								deviceId = findDevice(name, deviceJson);
							console.log(`Found device ID for name=${name}: ${deviceId}`);

							// Try to retrieve the filter lists
							options.uri = 'https://freedom.to/filter_lists';
							return rp(options).then(filterListJson => {
								// console.log(`Filter Lists JSON: ${JSON.stringify(filterListJson)}`);
								const name = 'My Block List',
									blockListId = findBlockList(name, filterListJson);
								console.log(`Found block list for name=${name}: ${blockListId}`);

								ph.exit();
							});
						}).catch(err => {
							console.log(`Request failed: ${err}`);
							ph.exit();
						});
					}
				});
			});
		});
	});
});
