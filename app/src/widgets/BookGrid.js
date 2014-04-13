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
        var container = new ContainerSurface({
            size: this.options.itemSize,
            classes: ['book-item']
        });
        container.data = data;
        container._bookInfoSurface = new Surface({
            content: this._bookRenderer(data),
            classes: ['book-info-block']
        });
        var imageHeight = (this.options.itemSize[1] * 0.4);
        var imageWidth = imageHeight / this.options.pictureAspectRatio;
        container._imageSurface = new ImageSurface({
            size: [imageHeight, imageWidth],
            origin: [0.5, 0]
        });
        container._imageSurface.setContent((!data.imageUrl ? 'content/images/books/1.jpg' : data.imageUrl));

        container.add(new Modifier({
            origin: [0.5, 0]

        })).add(container._imageSurface);

        container.add(new Modifier({
            transform: Transform.translate(0,imageHeight)
            //origin: [0, 1]
        })).add(container._bookInfoSurface);

        container.on('click', function(target, data) {
            this._eventOutput.emit('book-item-clicked', target, data);
        }.bind(this, container, container.data));
        return container;
    };

    BookGrid.prototype._bookRenderer = _.template(
        '<div class="book-price">$<%= price %></div>' +
        '<div class="book-name"><%= name %></div>'
    );

    module.exports = BookGrid;
});
