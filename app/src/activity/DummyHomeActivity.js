
define(function(require, exports, module) {
    var Activity = require('activity/common/Activity');
    var Surface = require('famous/core/Surface');
    var BookGrid = require('widgets/BookGrid');

    var DUMMY_BOOK_DATA = [
        { name: "Death on Demand", price: '9.20', imageUrl: 'content/images/books/1.jpg' },
        { name: "Deeply Odd", price: '5.70', imageUrl: 'content/images/books/2.jpg' },
        { name: "Funny Business", price: '20.00', imageUrl: 'content/images/books/3.jpg' },
        { name: "Steve Jobs", price: '21.99', imageUrl: 'content/images/books/4.jpg' },
        { name: "Sex Machine", price: '10.30', imageUrl: 'content/images/books/5.jpg' },
        { name: "Jerusalem", price: '15.99', imageUrl: 'content/images/books/6.jpg' },
        { name: "Dragon Warrior", price: '4.20', imageUrl: 'content/images/books/7.jpg' },
        { name: "The Silver Linings Playbook", price: '9.70', imageUrl: 'content/images/books/8.jpg' },
        { name: "The Goldfinch", price: '3.75', imageUrl: 'content/images/books/10.jpg' },
    ];

    function DummyHomeActivity(options, app) {
        Activity.apply(this, arguments);
        var bookGrid = new BookGrid({
            size: this.options.size
        }, DUMMY_BOOK_DATA);
        bookGrid.on('book-item-clicked', function(target, data){
            window.App.activityHolder.showCachedActivity('DummyBookDetailsActivity');
            window.App.bottomToolbar.setActiveItem(undefined);
        });
        this.add(bookGrid);
    };

    DummyHomeActivity.activityClassName='DummyHomeActivity';
    DummyHomeActivity.prototype = Object.create(Activity.prototype);
    DummyHomeActivity.prototype.constructor = DummyHomeActivity;

    DummyHomeActivity.prototype.prepareBottomToolbar = function(app, bottomToolbar) {
        
    };

    module.exports = DummyHomeActivity;
});
