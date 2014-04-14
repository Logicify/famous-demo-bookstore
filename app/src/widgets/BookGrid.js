define(function(require, exports, module) {
    var View = require('famous/core/View');
    var Modifier = require('famous/core/Modifier');
    var Surface = require('famous/core/Surface');
    var ScrollView = require('famous/views/Scrollview');
    var ContainerSurface = require('famous/surfaces/ContainerSurface');
    var SequentialLayout = require('famous/views/SequentialLayout');
    var ImageSurface = require('famous/surfaces/ImageSurface');
    var Transform          = require('famous/core/Transform');
    var Utility = require('famous/utilities/Utility');
    var _ = require('underscore');

    function BookGrid(options, datasource) {
        View.apply(this, arguments);
        this.books = [];
        if (!this.options.itemSize) {
            this.options.itemSize = [this.options.size[0] / this.options.itemsPerRow, this.options.size[1] / this.options.itemsPerRow];
        }
        this._imageHeight = (this.options.itemSize[1] * 0.4);

        this.gridRows = [];
        this.scrollView = new ScrollView({
            direction: Utility.Direction.Y,
            friction: 0,
            paginated: true,
            drag: 0.001
        });
        this.scrollView.sequenceFrom(this.gridRows);
        for (var i = 0; i < datasource.length; i++){
            this.addBookToGrid(datasource[i]);
        }
        this.add(this.scrollView);
    }

    BookGrid.prototype = Object.create(View.prototype);
    BookGrid.prototype.constructor = BookGrid;

    BookGrid.DEFAULT_OPTIONS = {
        itemSize: undefined,
        pictureAspectRatio: 0.769,
        itemsPerRow: 3
    };

    BookGrid.prototype.createBookSurface = function(data) {
        data.imageUrl = (!data.imageUrl ? 'content/images/books/1.jpg' : data.imageUrl);
        var container = new Surface({
            size: this.options.itemSize,
            classes: ['book-item'],
            content: this._bookRenderer(_.extend({imageHeight: this._imageHeight}, data))
        });
        container.data = data;
        container.on('click', function(target) {
            this._eventOutput.emit('book-item-clicked', {target: target, data:data});
        }.bind(this, container));
        return container;
    };

    BookGrid.prototype._bookRenderer = _.template(
        '<div class="book-info-block">' +
        '<img class="book-image" height="<%= imageHeight %>" src="<%= imageUrl %>">' +
        '<div class="book-price">$<%= price %></div>' +
        '<div class="book-name"><%= name %></div>' +
        '</div>'
    );

    function _createSequensialLayout() {
        var sequentialLayout = new SequentialLayout({direction: Utility.Direction.X});
        sequentialLayout.items = [];
        sequentialLayout.sequenceFrom(sequentialLayout.items);
        return sequentialLayout;
    }

    BookGrid.prototype.addBookToGrid = function(data) {
        var book = this.createBookSurface(data);
        this.books.push(book);
        if (this.gridRows.length == 0) {
            this.gridRows[this.gridRows.length] = _createSequensialLayout();
        }
        var lastRow = this.gridRows[this.gridRows.length - 1];
        if (lastRow.items.length >= this.options.itemsPerRow) {
            lastRow = _createSequensialLayout();
            this.gridRows[this.gridRows.length] = lastRow;
        }
        book.pipe(this.scrollView);
        lastRow.items.push(book);
    };

    module.exports = BookGrid;
});
