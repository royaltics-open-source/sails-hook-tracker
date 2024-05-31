'use strict';

var utils = require('./utils');

module.exports.parseText = function parseText(message, kwargs) {
  kwargs = kwargs || {};
  kwargs.title = message;

  return kwargs;
};

module.exports.parseError = function parseError(err, kwargs, cb) {
  utils.parseStack(err, function (frames) {
    var name = err.name + '';
    if (typeof kwargs.message === 'undefined') {
      kwargs.title = name + ': ' + (err.message || '<no message>');
    }
    kwargs.exception = [{
      type: name,
      value: err.message,
      stacktrace: {
        frames: frames
      }
    }];

    // Save additional error properties to `extra` under the error type (e.g. `extra.AttributeError`)
    var extraErrorProps;
    for (var key in err) {
      if (err.hasOwnProperty(key)) {
        if (key !== 'name' && key !== 'message' && key !== 'stack') {
          extraErrorProps = extraErrorProps || {};
          extraErrorProps[key] = err[key];
        }
      }
    }
    if (extraErrorProps) {
      kwargs.extra = kwargs.extra || {};
      kwargs.extra[name] = extraErrorProps;
    }

    for (var n = frames.length - 1; n >= 0; n--) {
      if (frames[n].in_app) {
        kwargs.culprit = kwargs.culprit || utils.getCulprit(frames[n]);
        break;
      }
    }

    cb(kwargs);
  });
};
