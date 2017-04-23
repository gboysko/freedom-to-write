'use strict';

const fs = require('fs');

// Module for logging
const log = require('electron-log');
log.transports.file.level = 'silly';

// OS Module
const os = require('os');
// Path Module
const path = require('path');

// The path to our History file..
const FILE_HISTORY = path.join(os.homedir(), '.ftw-history');

// Our past history
let historyArray = [];

// Our history file descriptor
let historyFileDescriptor;

// Read all data from the file...
const readAll = () => {
	try {
		// Try to read the entire file at once...
		const contents = fs.readFileSync(FILE_HISTORY, {encoding: 'utf8'});

		// Do we have data?
		if (contents) {
			// Parse the file, one line at a time...
			historyArray = contents.split(/\r?\n/).filter(l => l).map(l => {
				try {
					return JSON.parse(l);
				} catch(err) {
					log.error(`Unable to parse JSON in file '${FILE_HISTORY}': ${l}: err=${err}`);
					return '';
				}
			}).filter(o => o);
		}
	} catch (err) {
		if (err.code !== 'ENOENT') {
			// Log it...
			log.error(`Unable to read history file contents for '${FILE_HISTORY}': err=${err}`);
		}
	}

	// Can we open the file for writing?
	historyFileDescriptor = fs.openSync(FILE_HISTORY, 'a');
	if (!historyFileDescriptor) {
		// Log it...
		log.error(`Unable to open file for appending: ${FILE_HISTORY}`);
		return;
	}
};

class History {
	constructor() {
		// Read all lines of history...
		readAll();
	}

	// Return our previous history
	getAll() {
		return historyArray;
	}

	startNewSession(desiredWordCount) {
		// Can we record new history?
		if (historyFileDescriptor) {
			try {
				// Create a new record...
				const record = {startTime: Date.now(), desiredWordCount};

				// Append it to our file...
				fs.appendFileSync(historyFileDescriptor, JSON.stringify(record) + os.EOL);

				// Close the file for writing...
				fs.closeSync(historyFileDescriptor);

				// Append to our in-memory data structure...
				historyArray.push(record);
			} catch (err) {
				log.error(`Unable to record a new session to history: ${err}`);
			}
		}
	}

	endSession(wordsWritten) {
		log.info(`endSession: wordsWritten=${wordsWritten}`);

		// Do we have history being recorded?
		if (historyArray.length) {
			// Last record...
			const lastRecord = historyArray[historyArray.length-1];

			// Verify that there is no end time
			if (lastRecord.endTime) {
				log.error('Unexpected error: last record of history already has end time!');
			} else {
				// Modify the last record...
				lastRecord.endTime = Date.now();
				lastRecord.actualWordCount = wordsWritten;

				try {
					// Write the entire file contents...
					fs.writeFileSync(FILE_HISTORY, historyArray.map(o => JSON.stringify(o)).join(os.EOL) + os.EOL);
				} catch (err) {
					log.error(`Unable to rewrite history: ${err}`);
				}
			}
		}
	}
}

module.exports = new History();
