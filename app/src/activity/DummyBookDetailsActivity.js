
define(function(require, exports, module) {
    var Activity = require('activity/common/Activity');
    var Surface = require('famous/core/Surface');

    function DummyBookDetailsActivity(options, app) {
        Activity.apply(this, arguments);
        var primary = new Surface({
            size: [undefined, undefined],
            content: 'Book details activity',
            classes: ['red-bg'],
            origin: [0.5, 0.5],
            properties: {
                lineHeight: window.innerHeight + 'px',
                textAlign: 'center'
            }
        });
        this.add(primary);
    }

    DummyBookDetailsActivity.activityClassName='DummyBookDetailsActivity';
    DummyBookDetailsActivity.prototype = Object.create(Activity.prototype);
    DummyBookDetailsActivity.prototype.constructor = DummyBookDetailsActivity;

    DummyBookDetailsActivity.prototype.onBackAction = function(app, defaultBackAnimation) {
        app.activityHolder.showCachedActivity('DummyHomeActivity', defaultBackAnimation);
    };

    module.exports = DummyBookDetailsActivity;
});
