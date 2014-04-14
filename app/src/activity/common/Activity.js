/**
 * Created by LOGICIFY\corvis on 4/12/14.
 */
define(function(require, exports, module) {
    var View = require('famous/core/View');

    function Activity(options) {
        View.apply(this, arguments);
    }

    Activity.prototype = Object.create(View.prototype);
    Activity.prototype.constructor = Activity;

    /**
     * Will be invoked before activity holder starts loading this activity.
     * @param app
     */
    Activity.prototype.beforeOpening = function(app, parameters) {

    };

    Activity.prototype.prepareNavigationBar = function(app, navigationBar) {

    };

    Activity.prototype.prepareBottomToolbar = function(app, bottomToolbar) {

    };

    /**
     * Should be callback which takes 2 parameters: app, defaultBackAnimation
     * @param app
     * @param defaultBackAnimation
     */
    Activity.prototype.onBackAction = false;

    /**
     * Should be callback
     * @param app
     * @param defaultBackAnimation
     */
    Activity.prototype.onMoreAction = false;

    module.exports = Activity;
});
