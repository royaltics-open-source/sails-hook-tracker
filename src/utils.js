'use strict';

var fs = require('fs');
var path = require('path');
var lsmod = require('lsmod');
var stacktrace = require('stack-trace');
var version = require('../package.json').version;
var consoleAlerts = {};

module.exports.disableConsoleAlerts = function disableConsoleAlerts() {
  consoleAlerts = false;
};

module.exports.consoleAlert = function consoleAlert(msg, data = '') {
  if (consoleAlerts) {
    sails.log.debug("sails-hooks-tracker@" + version + ': ' + msg, data);
  }
};

module.exports.consoleAlertOnce = function consoleAlertOnce(msg) {
  if (consoleAlerts && !(msg in consoleAlerts)) {
    consoleAlerts[msg] = true;
    sails.log.debug("sails-hooks-tracker@" + version + ': ' + msg);
  }
};

module.exports.extend = Object.assign || function (target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i];
    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        target[key] = source[key];
      }
    }
  }
  return target;
};


module.exports.parseDSN = function parseDSN(dsn) {
  if (!dsn) {
    // Let a falsey value return false explicitly
    return false;
  }
  try {

    if (!dsn.includes("http")) {
      throw new Error('Invalid Protocol Http transport  tracker');
    }

    if (!dsn.includes("hook/capture-errors/")) {
      throw new Error('Invalid Route Path transport Capture tracker');
    }

    const parsedUrl = new URL(dsn);
    const portDefault = parsedUrl.protocol === 'https:' ? '443' : '80';
    return {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      port: parsedUrl.port && parsedUrl.port !== '' ? parsedUrl.port : portDefault,
      protocol: parsedUrl.protocol,
      protocolIndex: parsedUrl.protocol === 'http:' ? 0 : 1,
    };
  } catch (e) {
    throw new Error('Invalid tracker DSN: ' + dsn + " -> " + e?.message);
  }
};

module.exports.getCulprit = function getCulprit(frame) {
  if (frame.module || frame.function) {
    return (frame.module || '?') + ' at ' + (frame.function || '?');
  }
  return '<unknown>';
};

var moduleCache;
module.exports.getModules = function getModules() {
  if (!moduleCache) {
    moduleCache = {}
    const modules = lsmod();
    let i = 0;
    for (let m of Object.keys(modules)) {
      if (i > 15) break;
      moduleCache[m] = modules[m];
      i++;
    }
  }
  return moduleCache;
};


var LINES_OF_CONTEXT = 7;

function getFunction(line) {
  try {
    return line.getFunctionName() ||
      line.getTypeName() + '.' + (line.getMethodName() || '<anonymous>');
  } catch (e) {
    // This seems to happen sometimes when using 'use strict',
    // stemming from `getTypeName`.
    // [TypeError: Cannot read property 'constructor' of undefined]
    return '<anonymous>';
  }
}

var mainModule = (require.main && require.main.filename && path.dirname(require.main.filename) || process.cwd()) + '/';

function getModule(filename, base) {
  if (!base) base = mainModule;

  // It's specifically a module
  var file = path.basename(filename, '.js');
  filename = path.dirname(filename);
  var n = filename.lastIndexOf('/node_modules/');
  if (n > -1) {
    // /node_modules/ is 14 chars
    return filename.substr(n + 14).replace(/\//g, '.') + ':' + file;
  }
  // Let's see if it's a part of the main module
  // To be a part of main module, it has to share the same base
  n = (filename + '/').lastIndexOf(base, 0);
  if (n === 0) {
    var module = filename.substr(base.length).replace(/\//g, '.');
    if (module) module += ':';
    module += file;
    return module;
  }
  return file;
}

function parseLines(lines, frame) {
  frame.pre_context = lines.slice(Math.max(0, frame.lineno - (LINES_OF_CONTEXT + 1)), frame.lineno - 1);
  frame.context_line = lines[frame.lineno - 1];
  frame.post_context = lines.slice(frame.lineno, frame.lineno + LINES_OF_CONTEXT);
}

function parseStack(err, cb) {
  var frames = [],
    cache = {};

  if (!err) {
    return cb(frames);
  }

  var stack = stacktrace.parse(err);

  // check to make sure that the stack is what we need it to be.
  if (!stack || !Array.isArray(stack) || !stack.length || !stack[0].getFileName) {
    // lol, stack is fucked
    return cb(frames);
  }

  var callbacks = stack.length;

  // Sentry requires the stack trace to be from oldest to newest
  stack.reverse();

  return stack.forEach(function (line, index) {
    var frame = {
      filename: line.getFileName() || '',
      lineno: line.getLineNumber(),
      colno: line.getColumnNumber(),
      'function': getFunction(line),
    },
      isInternal = line.isNative() ||
        frame.filename[0] !== '/' &&
        frame.filename[0] !== '.' &&
        frame.filename.indexOf(':\\') !== 1;

    // in_app is all that's not an internal Node function or a module within node_modules
    // note that isNative appears to return true even for node core libraries
    // see https://github.com/getsentry/tracker-node/issues/176
    frame.in_app = !isInternal && frame.filename.indexOf('node_modules/') === -1;

    // Extract a module name based on the filename
    if (frame.filename) frame.module = getModule(frame.filename);

    // internal Node files are not full path names. Ignore them.
    if (isInternal) {
      frames[index] = frame;
      if (--callbacks === 0) cb(frames);
      return;
    }

    if (frame.filename in cache) {
      parseLines(cache[frame.filename], frame);
      if (--callbacks === 0) cb(frames);
      return;
    }

    fs.readFile(frame.filename, function (_err, file) {
      if (!_err) {
        file = file.toString().split('\n');
        cache[frame.filename] = file;
        parseLines(file, frame);
      }
      frames[index] = frame;
      if (--callbacks === 0) cb(frames);
    });
  });
}

// expose basically for testing because I don't know what I'm doing
module.exports.parseStack = parseStack;
module.exports.getModule = getModule;
