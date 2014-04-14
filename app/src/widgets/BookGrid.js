define(function(require, exports, module) {
    var View = require('famous/core/View');
    var Modifier = require('famous/core/Modifier');
    var Surface = require('famous/core/Surface');
    var GridLayout = require('famous/views/GridLayout');
    var ContainerSurface = require('famous/surfaces/ContainerSurface');
    var ImageSurface = require('famous/surfaces/ImageSurface');
    var Transform          = require('famous/core/Transform');
    var _ = require('underscore');

    function BookGrid(options, datasource) {
        View.apply(this, arguments);

        this.books = [];
        var layout = new GridLayout({
            //cellSize: this.options.itemSize,
            dimensions: [3,3]
        });
        if (!this.options.itemSize) {
            this.options.itemSize = [this.options.size[0] / layout.options.dimensions[0], this.options.size[1] / layout.options.dimensions[1]];
        }
        //layout.addClass('book-grid');
        layout.sequenceFrom(this.books);

        for (var i = 0; i < datasource.length; i++){
            var book = this.createBookSurface(datasource[i]);
            this.books.push(book);
        }
        this.add(layout);
    }

    BookGrid.prototype = Object.create(View.prototype);
    BookGrid.prototype.constructor = BookGrid;

    BookGrid.DEFAULT_OPTIONS = {
        itemSize: undefined,
        pictureAspectRatio: 0.769
    };

    BookGrid.prototype.createBookSurface = function(data) {

        var imageHeight = (this.options.itemSize[1] * 0.4);
        var imageWidth = imageHeight / this.options.pictureAspectRatio;

        window.console.log('height: ' + imageHeight);

        data.imageUrl = (!data.imageUrl ? 'content/images/books/1.jpg' : data.imageUrl);

        var container = new Surface({
            size: this.options.itemSize,
            classes: ['book-item'],
            content: this._bookRenderer(_.extend({imageHeight: imageHeight}, data))
        });
        container.data = data;

        container.on('click', function(target, data) {
            this._eventOutput.emit('book-item-clicked', target, data);
        }.bind(this, container, container.data));
        return container;
    };

    BookGrid.prototype._bookRenderer = _.template(
        '<div class="book-info-block">' +
        '<img class="book-image" height="<%= imageHeight %>" src="<%= imageUrl %>">' +
        '<div class="book-price">$<%= price %></div>' +
        '<div class="book-name"><%= name %></div>' +
        '</div>'
    );

    module.exports = BookGrid;
});
