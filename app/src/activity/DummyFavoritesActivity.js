
define(function(require, exports, module) {
    var Activity = require('activity/common/Activity');
    var Surface = require('famous/core/Surface');
    var BookGrid = require('widgets/BookGrid');

    var DUMMY_BOOK_DATA = [
        { name: 'Sex Machine', price: '10.30', imageUrl: 'content/images/books/5.jpg' },
        { name: 'Steve Jobs', price: '21.99', imageUrl: 'content/images/books/4.jpg' },
        { name: 'The Silver Linings Playbook', price: '9.70', imageUrl: 'content/images/books/8.jpg' },
        { name: 'The Goldfinch', price: '3.75', imageUrl: 'content/images/books/10.jpg' },
        { name: 'Jerusalem', price: '15.99', imageUrl: 'content/images/books/6.jpg' }
    ];

    function DummyFavoritesActivity(options, app) {
        Activity.apply(this, arguments);
        var bookGrid = new BookGrid({
            size: this.options.size
        }, DUMMY_BOOK_DATA);
        bookGrid.on('book-item-clicked', function(target, data) {
            window.App.activityHolder.showCachedActivity('DummyBookDetailsActivity');
            window.App.bottomToolbar.setActiveItem(undefined);
        });
        this.add(bookGrid);
    }

    DummyFavoritesActivity.activityClassName='DummyFavoritesActivity';
    DummyFavoritesActivity.prototype = Object.create(Activity.prototype);
    DummyFavoritesActivity.prototype.constructor = DummyFavoritesActivity;

    DummyFavoritesActivity.prototype.prepareBottomToolbar = function(app, bottomToolbar) {

    };

    DummyFavoritesActivity.prototype.onBackAction = function(app, defaultBackAnimation) {
        app.activityHolder.showCachedActivity('DummyHomeActivity', defaultBackAnimation);
    };

    module.exports = DummyFavoritesActivity;
});
