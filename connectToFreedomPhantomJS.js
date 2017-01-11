const readline = require('readline-sync');

// Try to connect to the sign-in page
var phantom = require('phantom');
phantom.create(
	['--ignore-ssl-errors=yes', '--load-images=no'],
	{
		xphantomPath: '/home/glenn/phantom/bin/phantomjs',
		logLevel: 'debug'
}).then(ph => {
	// Status...
	console.log('Succesfully created PhantomJS');

	// Ask for a page
	return ph.createPage().then(page => {
		// Try to open the sign-in page!
		page.open('https://freedom.to/sign-in/').then(status => {
			// Loaded the page!
			console.log(`Loaded the page: ${status}`);

			// How do I dump the Cookies collected?
			// console.log('How do I dump the cookies?');

			// Try to find the 'authenticity_token' input!
			page.evaluate(function() {
				var inputElement = document.querySelector("input[type=hidden][name=authenticity_token]");
				if (inputElement) {
					return inputElement.attributes['value'].value;
				}
			}).then(authenticity_token => {
				// Display it!
				console.log('authenticity_token is ' + authenticity_token);

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
				// Add a Handler...
				page.on('onLoadFinished', (status) => {
					// Try to find our current URL
					page.evaluate(function() {
						return window.location.href;
					}).then(url => {
						// Is this the freedom.to/freedom page?
						if (url === 'https://freedom.to/freedom') {
							// Try to specify a 1 minute schedule...
							page.evaluate(function() {
								// Find the necessary fields...
								var enabledTimeInput = document.getElementById("enabled-time-input");
								var filterForm = document.getElementById("enable-filter-form");
								var allCheckboxes = document.querySelectorAll("div.block-list-picker input[type=checkbox]");

								var values = [];

								// Mark all as being checked...
								for (var i=0; i<allCheckboxes.length; i++) {
									values.push(allCheckboxes[i].value);
								}
								return 'Found ' + allCheckboxes.length + ' checkboxes: ' + values.join(', ');

								// Put 1 minute in!
								enabledTimeInput.value = 1;

								if (filterForm) {
									filterForm.submit();
								}
							}).then((msg) => {
								console.log(msg);
								// Exit Phantom...
								ph.exit();
							});
						}
					});
				});
			});
		});
	});
});
