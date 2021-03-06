define(function(require, exports, module) {
    'use strict';
    var HeaderFooterLayout = require('famous/views/HeaderFooterLayout');
    var Surface = require('famous/core/Surface');
    var ContainerSurface = require('famous/surfaces/ContainerSurface');
    var OptionsManager = require('famous/core/OptionsManager');
    var NavigationBar = require('widgets/common/NavigationBar');
    var ActivityHolder = require('activity/common/ActivityHolder');
    var BottomToolbar = require('widgets/common/BottomToolbar');
    var BottomToolbarItem = require('widgets/common/BottomToolbarItem');
    // Activities
    var DummyHomeActivity = require('activity/DummyHomeActivity');
    var DummyBookDetailsActivity = require('activity/DummyBookDetailsActivity');
    var DummyFavoritesActivity = require('activity/DummyFavoritesActivity');

    function App(context, options) {
        window.App = this;
        this.updateDeviceInfo();
        // Handeling options
        this.context = context;
        this.options = Object.create(App.DEFAULT_OPTIONS);
        this._optionsManager = new OptionsManager(this.options);
        if (options) this.setOptions(options);

        var mainLayout = new HeaderFooterLayout({
            headerSize: this.options.layout.headerHeight,
            footerSize: this.options.layout.footerHeight
        });
        // Preparing main layout components
        this.contentContainer = new ContainerSurface({
            size: [window.innerWidth,
                window.innerHeight-this.options.layout.headerHeight - this.options.layout.footerHeight],
            properties: {
                overflow: 'hidden'
            }
        });
        this.header = new NavigationBar({
            size: [window.innerWidth, mainLayout.options.headerSize],
            classes: ['app-header'],
            backContent: 'Back'
        });
        this.header._optionsManager.set('backClasses', ['back-button']);
        this.header._optionsManager.set('moreClasses', ['more-button']);

        this.footer = new ContainerSurface({
            size: [undefined, mainLayout.footerSize],
            classes: ['app-footer']
        });
        mainLayout.footer.add(this.footer);
        mainLayout.content.add(this.contentContainer);
        mainLayout.header.add(this.header);

        context.add(mainLayout);
        // Create bottom toolbar
        this.bottomToolbar = this.createBottomNavigation();

        // Register activity holder
        this.activityHolder = this.createActivityHolder();
        //

        this.activityHolder.showCachedActivity('DummyHomeActivity', this.activityHolder.ANIMATION.fadeIn);
        return this;
    }

    App.DEFAULT_OPTIONS = {
        layout: {
            headerHeight: 50,
            footerHeight: 60
        }
    };

    App.prototype.createBottomNavigation = function() {
        var bottomToolbar = new BottomToolbar({
            items: [
                new BottomToolbarItem({
                    id: 'home',
                    text: 'Home',
                    iconClass: 'glyphicon glyphicon-home',
                    onClick: function(data) {
                        this.activityHolder.showCachedActivity('DummyHomeActivity',
                            this.activityHolder.ANIMATION.slideFromLeft);
                        bottomToolbar.setActiveItem(data);
                    }.bind(this)
                }),
                new BottomToolbarItem({
                    id: 'favorites',
                    iconClass: 'glyphicon glyphicon-heart',
                    text: 'Favorites',
                    onClick: function(data) {
                        this.activityHolder.showCachedActivity('DummyFavoritesActivity');
                        bottomToolbar.setActiveItem(data);
                    }.bind(this)
                })
            ]
        });
        this.footer.add(bottomToolbar);
        return bottomToolbar;
    };

    App.prototype.createActivityHolder = function() {
        var activityHolder = new ActivityHolder({
            size: this.contentContainer.getSize(false)
        });
        this.contentContainer.add(activityHolder);
        // Creating activities
        activityHolder.createCachedActivity(DummyHomeActivity);
        activityHolder.createCachedActivity(DummyBookDetailsActivity);
        activityHolder.createCachedActivity(DummyFavoritesActivity);
        //
        this.header.on('back', function() {
            if (activityHolder.currentActivity) {
                activityHolder.currentActivity.onBackAction(window.App,
                    window.App.activityHolder.ANIMATION.slideFromLeft);
            }
        });
        return activityHolder;
    };
    App.prototype.setOptions = function setOptions(options) {
        return this._optionsManager.setOptions(options);
    };

    App.prototype.Orientation = {PORTRAIT: 0, LANDSCAPE: 1};
    App.prototype.SizeClassification = {XSMALL: 0, SMALL: 1, NORMAL: 2, LARGE: 3, XLARGE: 4};
    App.prototype.classifyScreenSize = function(width, height) {
        var sq = (width * height) / window.devicePixelRatio;
        if (sq <= 320*360) return this.SizeClassification.SMALL;
        if (sq <= 320*470) return this.SizeClassification.NORMAL;
        if (sq <= 640*480) return this.SizeClassification.LARGE;
        if (sq <= 720*640) return this.SizeClassification.XLARGE;
        return this.SizeClassification.XLARGE;
    };
    App.prototype.updateDeviceInfo = function() {
        this.deviceInfo = {
            orientation: window.innerWidth < window.innerHeight ? this.Orientation.PORTRAIT : this.Orientation. LANDSCAPE,
            sizeClassification: this.classifyScreenSize(window.innerWidth, window.innerHeight)
        };
    };

    module.exports = App;
});
