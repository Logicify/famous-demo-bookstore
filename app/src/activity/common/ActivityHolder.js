/**
 * Created by LOGICIFY\corvis on 4/12/14.
 */
define(function(require, exports, module) {
    var Surface = require('famous/core/Surface');
    var View = require('famous/core/View');
    var Utility = require('famous/utilities/Utility');
    var RenderController = require('famous/views/RenderController');
    var Transform          = require('famous/core/Transform');
    var Transitionable = require('famous/transitions/Transitionable');
    var Engine      = require('famous/core/Engine');

    function ActivityHolder(options) {
        View.apply(this, arguments);
        this.renderController = new RenderController({
            inTransition: this.options.inTransition,
            outTransition: this.options.outTransition
        });
        this._activityCache = {};
        this.currentActivity = undefined;
        this.add(this.renderController);
    }

    ActivityHolder.DEFAULT_OPTIONS = {
        inTransition: { duration: 300, curve: 'easeIn' },
        outTransition: { duration: 300, curve: 'easeIn' }
    };

    ActivityHolder.prototype = Object.create(View.prototype);
    ActivityHolder.prototype.constructor = ActivityHolder;
    ActivityHolder.prototype.ANIMATION = {
        slideFromRight: {
            transformIn: function(progress) {
                return Transform.translate((1 - progress)*window.innerWidth, 0);
            },
            transformOut: function(progress) {
                return Transform.translate((progress-1)*window.innerWidth, 0);
            },
            opacityIn: function(progress) {
                return 1;
            },
            opacityOut: function(progress) {
                return 1;
            }
        },
        slideFromLeft: {
            transformIn: function(progress) {
                return Transform.translate((progress-1)*window.innerWidth, 0);
            },
            transformOut: function(progress) {
                return Transform.translate((1 - progress)*window.innerWidth, 0);
            },
            opacityIn: function(progress) {
                return 1;
            },
            opacityOut: function(progress) {
                return 1;
            }
        },
        fadeIn: {
            transformIn: function(progress) {
                return Transform.identity;
            },
            transformOut: function(progress) {
                return Transform.identity;
            },
            opacityIn: function(progress) {
                return progress;
            },
            opacityOut: function(progress) {
                return 1;
            }
        }
    };

    ActivityHolder.prototype.showActivity = function(activity, transitionMap, parameters) {
        if (!transitionMap) transitionMap = this.ANIMATION.slideFromRight;
        this.renderController.inTransformFrom(transitionMap.transformIn);
        this.renderController.outTransformFrom(transitionMap.transformOut);
        this.renderController.inOpacityFrom(transitionMap.opacityIn);
        this.renderController.outOpacityFrom(transitionMap.opacityIn);
        activity.beforeOpening(window.App, parameters);
        activity.prepareBottomToolbar(window.App, window.App.bottomToolbar);
        activity.prepareNavigationBar(window.App, window.App.header);
        window.App.header.setBackButtonEnabled(activity.onBackAction !== false);
        window.App.header.setMoreButtonEnabled(activity.onMoreAction !== false);
        if (this.currentActivity) {
            window.App.contentContainer.removeClass('activity-'+this.currentActivity.constructor.name);
        }
        window.App.contentContainer.addClass('activity-'+activity.constructor.name);
        this.currentActivity = activity;
        this.renderController.show(activity);
    };

    ActivityHolder.prototype.showCachedActivity = function(activity, transitionMap, parameters) {
        var activityObj = this.getCachedActivity(activity);
        if (!activityObj) {
            window.console.error('Unable to find activity ' + activity + ' in cache');
            return;
        }
        this.showActivity(activityObj, transitionMap, parameters);
    };

    ActivityHolder.prototype.cacheActivity = function(activityInstance, id) {
        if (!id) {
            id = '';
        }
        this._activityCache[id] = activityInstance;
        return id;
    };

    ActivityHolder.prototype.getCachedActivity = function(idOrClass) {
        return this._activityCache[idOrClass];
    };

    ActivityHolder.prototype.createActivity = function(activity, options) {
        if (!options) options = {};
        options.size = this.getSize();
        var obj = new activity(options, window.App);
        return obj;
    };

    ActivityHolder.prototype.createCachedActivity = function(activity, options) {
        this.cacheActivity(this.createActivity(activity, options), activity.name);

    };

    module.exports = ActivityHolder;
});
