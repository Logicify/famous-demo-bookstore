
define(function(require, exports, module) {
    var Activity = require('activity/common/Activity');
    var Surface = require('famous/core/Surface');
    var ImageSurface = require('famous/surfaces/ImageSurface');
    var Modifier = require('famous/core/Modifier');
    var Transform = require('famous/core/Transform');
    var _ = require('underscore');

    function DummyBookDetailsActivity(options, app) {
        Activity.apply(this, arguments);
        // Book title
        this.bookTitle = new Surface({
            classes: ['book-title'],
            size: [this.options.size[0] / 2, true],
            content: 'Loading'
        });
        this.add(this.bookTitle);
        var imageHeight = this.options.size[1] / 3;
        // Book image
        this.bookImage = new Surface({
            classes: ['book-image'],
            content: this._bookImageRenderer({url: 'content/images/books/1.jpg'}),
            size: [this.options.size[0] - this.bookTitle.size[0], imageHeight]
        });
        this.add(new Modifier({
            //transform: Transform.translate(0, 10),
            origin: [1, 0]
        })).add(this.bookImage);
        // Book price
        var priceHeight = '40';
        this.price = new Surface({
            classes: ['book-price'],
            size: [this.bookImage.size[0], priceHeight],
            content: '$0.00'
        });
        this.add(new Modifier({
            transform: Transform.translate(0, imageHeight + priceHeight),
            origin: [1, 0]
        })).add(this.price);
        // Added intro text
        var introHeight = 200;
        this.intro = new Surface({
            classes: ['intro-block'],
            size: [this.options.size[0], introHeight],
            content: this._bookIntroRenderer({text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Maecenas consequat ante orci, ac malesuada elit rhoncus eu. Quisque ultricies porttitor neque, a porttitor ipsum. Ut quis tortor et quam suscipit dictum in in nunc. Sed nec massa aliquam, consectetur diam ut, auctor leo. '})
        });
        this.add(new Modifier({
            transform: Transform.translate(0, imageHeight + priceHeight)
        })).add(this.intro);
    }

    DummyBookDetailsActivity.prototype = Object.create(Activity.prototype);
    DummyBookDetailsActivity.prototype.constructor = DummyBookDetailsActivity;

    DummyBookDetailsActivity.prototype.onBackAction = function(app, defaultBackAnimation) {
        app.activityHolder.showCachedActivity('DummyHomeActivity', defaultBackAnimation);
    };

    DummyBookDetailsActivity.prototype.beforeOpening = function(app, parameters) {
        this.bookImage.setContent(this._bookImageRenderer({url: parameters.imageUrl}));
        this.bookTitle.setContent(parameters.name);
    };

    DummyBookDetailsActivity.prototype._bookImageRenderer = _.template('<img class="book-image" alt="Cover" src="<%= url %>">');
    DummyBookDetailsActivity.prototype._bookIntroRenderer = _.template(
        '<div class="intro-label activity-label">Intro</div>' +
        '<div class="intro-text"><%= text %></div>'
    );

    module.exports = DummyBookDetailsActivity;
});
