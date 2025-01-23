

module.exports = function Tracker(sails) {
  return {
    /**
     * Default configuration
     *
     * We do this in a function since the configuration key for
     * the hook is itself configurable, so we can't just return
     * an object.
     */
    defaults: {
      __configKey__: {
        // Set autoreload to be active by default
        active: true,
        dsn: null,
        options: {}
      }
    },

    /**
     * Initialize the hook
     * @param  {Function} cb Callback for when we're done initializing
     * @return {Function} cb Callback for when we're done initializing
     */
    initialize: function (cb) {

      var settings = sails.config[this.configKey];

      if (!settings.active) {
        sails.log.error('Autoreload hook deactivated.');
        return cb();
      }

      if (!settings.dsn) {
        sails.log.error('DSN for Tracker is required in config/tracker.js module '+this.configKey);
        return cb();
      }

      var tracker = require("./src/client");
      tracker.config(settings.dsn, settings.options).install();

      sails.tracker = tracker;

      // handles Bluebird's promises unhandled rejections
      process.on('unhandledRejection', function (reason) {
        if(settings.options?.debug) console.error('Unhandled rejection:', reason);
        tracker.captureException(reason);
      });

      // We're done initializing.
      return cb();
    }
  };
};
