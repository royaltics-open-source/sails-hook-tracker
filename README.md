# sails-hook-tracker

This is a simple hook alternative to sentry and Raven
@git https://github.com/royaltics-open-source/sails-hook-tracker.git

## Installation

`npm install sails-hook-tracker`

### Requeriments

* requires at least sails >= 1.0*

### Configuration

By default, configuration lives in `sails.config.tracker`.  The configuration key (`tracker`) can be changed by setting `sails.config.hooks['sails-hook-tracker'].configKey`.

#### Tracker Examples 

```javascript
// [your-sails-app]/config/tracker.js
module.exports.tracker = {
  active: true,
  dsn: "https://XXXX/hook/capture-errors/",
  options: {
    release: '1.0.0',
    environment: 'dev'
  }
};
```

```javascript
// [your-sails-app]/api/controllers/UserController.js
/**
 * AppController
 */

module.exports = {
  find: function(req, res) {
    sails.tracker.captureMessage("this is a message");
    res.ok('ok');
  }
};
```

If you want to log 500 responses, add this to your responses/serverError.js

```javascript
// log error with tracker hook
if(sails.tracker) sails.tracker.captureException(new Error("test"));
```

> sails.tracker alias for Tracker client

