
define(function(require, exports, module) {
    var Activity = require('activity/common/Activity');
    var Surface = require('famous/core/Surface');
    var BookGrid = require('widgets/BookGrid');
    var _ = require('underscore');

    var DUMMY_BOOK_DATA = [
        { name: 'Death on Demand', price: '9.20', imageUrl: 'content/images/books/1.jpg' },
        { name: 'Deeply Odd', price: '5.70', imageUrl: 'content/images/books/2.jpg' },
        { name: 'Funny Business', price: '20.00', imageUrl: 'content/images/books/3.jpg' },
        { name: 'Steve Jobs', price: '21.99', imageUrl: 'content/images/books/4.jpg' },
        { name: 'Sex Machine', price: '10.30', imageUrl: 'content/images/books/5.jpg' },
        { name: 'Jerusalem', price: '15.99', imageUrl: 'content/images/books/6.jpg' },
        { name: 'Dragon Warrior', price: '4.20', imageUrl: 'content/images/books/7.jpg' },
        { name: 'The Silver Linings Playbook', price: '9.70', imageUrl: 'content/images/books/8.jpg' },
        { name: 'The Goldfinch', price: '3.75', imageUrl: 'content/images/books/10.jpg' },
        { name: 'Death on Demand', price: '9.20', imageUrl: 'content/images/books/1.jpg' },
        { name: 'Deeply Odd', price: '5.70', imageUrl: 'content/images/books/2.jpg' },
        { name: 'Funny Business', price: '20.00', imageUrl: 'content/images/books/3.jpg' },
        { name: 'Steve Jobs', price: '21.99', imageUrl: 'content/images/books/4.jpg' },
        { name: 'Sex Machine', price: '10.30', imageUrl: 'content/images/books/5.jpg' },
        { name: 'Jerusalem', price: '15.99', imageUrl: 'content/images/books/6.jpg' },
        { name: 'Dragon Warrior', price: '4.20', imageUrl: 'content/images/books/7.jpg' },
        { name: 'The Silver Linings Playbook', price: '9.70', imageUrl: 'content/images/books/8.jpg' },
        { name: 'The Goldfinch', price: '3.75', imageUrl: 'content/images/books/10.jpg' }
    ];

    function DummyHomeActivity(options, app) {
        Activity.apply(this, arguments);
        var gridOptions = { rowsOnScreen: 4, itemsPerRow: 3 };
        switch (app.deviceInfo.sizeClassification) {
            case app.SizeClassification.SMALL:
                gridOptions = { rowsOnScreen: 2, itemsPerRow: 2 };
                break;
            case app.SizeClassification.LARGE:
                gridOptions = { rowsOnScreen: 5, itemsPerRow: 4 };
                break;
            case app.SizeClassification.XLARGE:
                gridOptions = { rowsOnScreen: 5, itemsPerRow: 4 };
                break;
        }
        if (app.deviceInfo.orientation == app.Orientation.LANDSCAPE) {
            if (app.deviceInfo.sizeClassification == app.SizeClassification.SMALL
                || app.deviceInfo.sizeClassification == app.SizeClassification.NORMAL) {
                gridOptions.itemsPerRow = 3;
                gridOptions.rowsOnScreen = 1;
            } else {
                var t = gridOptions.rowsOnScreen;
                gridOptions.rowsOnScreen = gridOptions.itemsPerRow;
                gridOptions.itemsPerRow = t;
            }
        }
        var bookGrid = new BookGrid(_.extend({
            size: this.options.size
        }, gridOptions), DUMMY_BOOK_DATA);
        bookGrid.on('book-item-clicked', function(event) {
            window.App.activityHolder.showCachedActivity('DummyBookDetailsActivity', undefined, event.data);
            window.App.bottomToolbar.setActiveItem(undefined);
        });
        this.add(bookGrid);
    }

    DummyHomeActivity.prototype = Object.create(Activity.prototype);
    DummyHomeActivity.prototype.constructor = DummyHomeActivity;

    DummyHomeActivity.prototype.prepareBottomToolbar = function(app, bottomToolbar) {

    };

    DummyHomeActivity.prototype.prepareNavigationBar = function(app, navigationBar) {
        navigationBar.setContent('Book store Famo.Us Demo');
    };

    module.exports = DummyHomeActivity;
});
