var fs = require('fs'),
	path = require('path'),
	XMLSerializer = require("xmldom").XMLSerializer,
	pkginfo = require('pkginfo')(module,'version'),
	U = require('./utils'),
	CONST = require('./common/constants'),
	logger = require('./logger');

var DEFAULT_TIAPP = path.join('.', 'tiapp.xml');

var tiapp = {},
	tiappFile, doc;

// initialize the project folder
tiapp.init = function(file) {
	tiappFile = file || DEFAULT_TIAPP;
	doc = tiapp.parse(tiappFile);
};

// Return an XML document object representing the tiapp.xml file
tiapp.parse = function(file) {
	file = file || tiappFile;
	if (!fs.existsSync(file)) {
		U.die('tiapp.xml file does not exist at "' + file + '"');
	}
	return U.XML.parseFromFile(file);
};

// Get the Titanium SDK version as a string
tiapp.getSdkVersion = function() {
	var elems = doc.documentElement.getElementsByTagName('sdk-version');
	return elems && elems.length > 0 ? U.XML.getNodeText(elems.item(elems.length-1)) : null;
};

// Get the value of a property from the tiapp.xml
tiapp.getProperty = function(name) {
	var props = doc.documentElement.getElementsByTagName('property');
	for (var i = 0; i < props.length; i++) {
		if (props.item(i).getAttribute('name') === name) {
			return props.item(i);
		}
	}
	return null;
};

// Increases the stack size property when the rhino runtime is used
tiapp.upStackSizeForRhino = function() {
	var runtime = U.XML.getNodeText(tiapp.getProperty(doc, 'ti.android.runtime'));
	if (runtime === 'rhino') {
		var stackSize = tiapp.getProperty(doc, 'ti.android.threadstacksize');
		if (stackSize !== null) {
			if (parseInt(stackSize.nodeValue, 10) < 32768) {
				stackSize.nodeValue('32768');
			}
		} else {
			var node = doc.createElement('property');
			var text = doc.createTextNode('32768');
			node.setAttribute('name', 'ti.android.threadstacksize');
			node.setAttribute('type', 'int');
			node.appendChild(text);
			doc.documentElement.appendChild(node);
		}

		// serialize the xml and write to tiapp.xml
		var serializer = new XMLSerializer();
		var newxml = serializer.serializeToString(doc);
		fs.writeFileSync(tiappFile, newxml, 'utf8');
	}
};

// Add a module to the tiapp.xml
tiapp.installModule = function(opts) {
	install('module', opts);
};

// Add a plugin to the tiapp.xml
tiapp.installPlugin = function(opts) {
	install('plugin', opts);
};

// make sure the target TiSDK version meets the minimum for Alloy
tiapp.validateSdkVersion = function() {
	var tiVersion = tiapp.getSdkVersion();
	if (tiVersion === null) {
		logger.warn('Unable to determine Titanium SDK version from tiapp.xml.');
		logger.warn('Your app may have unexpected behavior. Make sure your tiapp.xml is valid.');
	} else if (tiapp.version.lt(tiVersion, CONST.MINIMUM_TI_SDK)) {
		logger.error('Alloy ' + module.exports.version + ' requires Titanium SDK ' +
			CONST.MINIMUM_TI_SDK + ' or higher.');
		logger.error('"' + tiVersion + '" was found in the "sdk-version" field of your tiapp.xml.');
		logger.error('If you are building with the legacy titanium.py script and are specifying ');
		logger.error('an SDK version as a CLI argument that is different than the one in your ');
		logger.error('tiapp.xml, please change the version in your tiapp.xml file.');
		process.exit(1);
	}
};

// version comparison functions
tiapp.version = {
	compare: function(v1, v2) {
		// use the tiapp.xml version if v2 is not specified
		if (typeof v2 === 'undefined') {
			v2 = v1;
			v1 = tiapp.getSdkVersion();
		}

		var parts1 = (v1 || '').split('.'),
			parts2 = (v2 || '').split('.');

		for (var i = 0; i < 3; i++) {
			var p1 = parseInt(parts1[i] || 0, 10),
				p2 = parseInt(parts2[i] || 0, 10);
			if (p1 > p2) {
				return 1;
			} else if (p1 < p2) {
				return -1;
			}
		}

		return 0;
	},
	eq: function(v1, v2) { return tiapp.version.compare(v1, v2) === 0; },
	gt: function(v1, v2) { return tiapp.version.compare(v1, v2) === 1; },
	gte: function(v1, v2) { return tiapp.version.compare(v1, v2) !== -1; },
	lt: function(v1, v2) { return tiapp.version.compare(v1, v2) === -1; },
	lte: function(v1, v2) { return tiapp.version.compare(v1, v2) !== 1; },
	neq: function(v1, v2) { return tiapp.version.compare(v1, v2) !== 0; }
};

function install(type, opts) {
	type = type || 'module';
	opts = opts || {};

	var err = 'Project creation failed. Unable to install ' + type + ' "' +
		(opts.name || opts.id) + '"';

	// read the tiapp.xml file
	var collection = doc.documentElement.getElementsByTagName(type + 's');
	var found = false;

	// Determine if the module or plugin is already installed
	if (collection.length > 0) {
		var items = collection.item(0).getElementsByTagName(type);
		if (items.length > 0) {
			for (var c = 0; c < items.length; c++) {
				var theItem = items.item(c);
				var theItemText = U.XML.getNodeText(theItem);
				if (theItemText == opts.id) {
					found = true;
					break;
				}
			}
		}
	}

	// install module or plugin
	if (!found) {
		// create the node to be inserted
		var node = doc.createElement(type);
		var text = doc.createTextNode(opts.id);
		if (opts.platform) {
			node.setAttribute('platform',opts.platform);
		}
		if (opts.version) {
			node.setAttribute('version',opts.version);
		}
		node.appendChild(text);

		// add the node into tiapp.xml
		var pna = null;
		if (collection.length === 0) {
			var pn = doc.createElement(type + 's');
			doc.documentElement.appendChild(pn);
			doc.documentElement.appendChild(doc.createTextNode("\n"));
			pna = pn;
		} else {
			pna = collection.item(0);
		}
		pna.appendChild(node);
		pna.appendChild(doc.createTextNode("\n"));

		// serialize the xml and write to tiapp.xml
		var serializer = new XMLSerializer();
		var newxml = serializer.serializeToString(doc);
		fs.writeFileSync(tiappFile, newxml, 'utf8');

		logger.info('Installed "' + opts.id + '" ' + type + ' to ' + tiappFile);
	}

}

module.exports = tiapp;
